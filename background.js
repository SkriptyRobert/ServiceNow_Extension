let lastTicketCount = 0;
let lastTicketIds = new Set();
let monitoredUrl = '';
let soundType = 'default';
let customSoundData = null;
let lastCheckTime = 0;
let isMonitoring = false;
let audioTabId = null;
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Funkce pro aktualizaci počtu tiketů na ikoně
function updateBadge(count) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
}

// Funkce pro získání cookies pro doménu
async function getCookiesForDomain(domain) {
    try {
        const cookies = await chrome.cookies.getAll({domain: domain});
        console.log(`Got ${cookies.length} cookies for domain ${domain}`);
        return cookies;
    } catch (error) {
        console.error('Error getting cookies:', error);
        return [];
    }
}

// Funkce pro extrakci tiketů z HTML
function extractTickets(html) {
    try {
        const tickets = new Set();
        
        // Nejprve zkontrolujeme, zda je to prázdný seznam
        if (html.includes('No records to display') || 
            html.includes('No records found') || 
            html.includes('Žádné záznamy k zobrazení')) {
            console.log('Seznam je prázdný');
            return tickets;
        }

        // regex pattern pro hledání tiketů
        const patterns = [
            // Hledání v tabulce s konkrétní třídou
            /<table[^>]*class="[^"]*list_table[^"]*"[\s\S]*?<\/table>/gi,
            // Hledání v list2_body divu
            /<div[^>]*class="[^"]*list2_body[^"]*"[\s\S]*?<\/div>/gi
        ];

        // relevantní části HTML
        let relevantHtml = '';
        for (const pattern of patterns) {
            const matches = html.match(pattern);
            if (matches) {
                relevantHtml += matches.join('');
            }
        }

        // relevantní části tikety
        if (relevantHtml) {
            const ticketPattern = /(?:number="((?:INC|TASK|RITM|REQ|FTASK|SCTASK)\d+)"|sys_id="([^"]+)"[^>]*>[\s\S]*?((?:INC|TASK|RITM|REQ|FTASK|SCTASK)\d+))/gi;
            let match;
            while ((match = ticketPattern.exec(relevantHtml)) !== null) {
                const ticketNumber = match[1] || match[3];
                if (ticketNumber) {
                    tickets.add(ticketNumber.trim());
                }
            }
        }

        console.log('Found tickets:', Array.from(tickets));
        return tickets;
    } catch (error) {
        console.error('Error extracting tickets:', error);
        return new Set();
    }
}

// Funkce pro zajištění audio tabu
async function ensureAudioTab() {
    try {
        // kontrola existující taby
        const tabs = await chrome.tabs.query({});
        const audioTabs = tabs.filter(tab => tab.url && tab.url.includes('audio.html'));
        
        // Pokud existuje více audio tabů, zavřeme všechny kromě prvního
        if (audioTabs.length > 1) {
            console.log(`Found ${audioTabs.length} audio tabs, cleaning up duplicates`);
            for (let i = 1; i < audioTabs.length; i++) {
                await chrome.tabs.remove(audioTabs[i].id);
            }
            audioTabId = audioTabs[0].id;
            return audioTabId;
        }
        
        // Pokud existuje jeden audio tab, použijeme ho
        if (audioTabs.length === 1) {
            audioTabId = audioTabs[0].id;
            return audioTabId;
        }

        // Pokud neexistuje žádný audio tab, vytvoříme nový
        const audioUrl = chrome.runtime.getURL('audio.html');
        const tab = await chrome.tabs.create({
            url: audioUrl,
            active: false,
            pinned: true
        });
        audioTabId = tab.id;
        return audioTabId;
    } catch (error) {
        console.error('Error managing audio tabs:', error);
        throw error;
    }
}

// Funkce pro přehrání zvuku
async function playSound() {
    try {
        const tabId = await ensureAudioTab();
        console.log('Sending playSound message to audio tab:', tabId);
        await chrome.tabs.sendMessage(tabId, {
            type: 'playSound',
            soundType: soundType,
            customSoundData: customSoundData
        });
    } catch (error) {
        console.error('Error playing sound:', error);
        // Pokud se nepodaří přehrát zvuk, zkusíme znovu vytvořit audio tab
        audioTabId = null;
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            setTimeout(playSound, RETRY_DELAY);
        }
    }
}

// Funkce pro získání dat ze ServiceNow
async function fetchServiceNowData() {
    if (!monitoredUrl) {
        console.log('No URL configured');
        chrome.action.setBadgeText({ text: "?" });
        return;
    }

    try {
        console.log('Fetching data from:', monitoredUrl);
        
        // Add parameters
        const urlWithParams = new URL(monitoredUrl);
        urlWithParams.searchParams.set('sysparm_timestamp', Date.now().toString());
        
        // get only needed data
        urlWithParams.searchParams.set('sysparm_fields', 'number,sys_id');
        urlWithParams.searchParams.set('sysparm_view', 'list');
        
        const response = await fetch(urlWithParams.toString(), {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Accept': 'text/html',
                'X-UserToken': await getUserToken()
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const currentTickets = extractTickets(html);
        const currentCount = currentTickets.size;

        // If the list is empty, show 0
        if (currentCount === 0) {
            console.log('No tickets found - empty list');
            chrome.action.setBadgeText({ text: "0" });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            lastTicketCount = 0;
            lastTicketIds = new Set();
            return;
        }

        // Update badge and state
        updateBadge(currentCount);

        // Check for new tickets - play sound on ANY increase
        if (lastTicketCount !== 0 && currentCount > lastTicketCount) {
            console.log(`Ticket count increased from ${lastTicketCount} to ${currentCount}`);
            
            // Play sound
            await playSound();
            
            // Create notification only for new tickets
            const newTickets = [...currentTickets].filter(id => !lastTicketIds.has(id));
            if (newTickets.length > 0) {
                createNotification(newTickets);
            } else {
                // If we can't identify specific new tickets, show general notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon192.png',
                    title: 'New ServiceNow Tickets',
                    message: `Ticket count increased from ${lastTicketCount} to ${currentCount}`
                });
            }
        }

        lastTicketCount = currentCount;
        lastTicketIds = currentTickets;
        lastCheckTime = Date.now();
        retryCount = 0; // Resetcounter on successful fetch

    } catch (error) {
        console.error('Error fetching ServiceNow data:', error);
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
        
        // Retry on error
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            setTimeout(fetchServiceNowData, RETRY_DELAY);
        }
    }
}

// funkce pro získání user tokenu
async function getUserToken() {
    try {
        const url = new URL(monitoredUrl);
        const cookies = await chrome.cookies.getAll({ domain: url.hostname });
        const glideToken = cookies.find(cookie => cookie.name === 'glide_user_token');
        return glideToken ? glideToken.value : '';
    } catch (error) {
        console.error('Error getting user token:', error);
        return '';
    }
}

// Funkce pro spuštění monitorování
function startMonitoring() {
    if (isMonitoring) {
        console.log('Monitoring already running');
        return;
    }
    
    console.log('Starting monitoring');
    isMonitoring = true;
    
    // Nastavíme počáteční stav
    lastTicketCount = 0;
    lastTicketIds = new Set();
    
    // Okamžitá první kontrola
    fetchServiceNowData();
    
    // Nastavení intervalu pro pravidelnou kontrolu
    chrome.alarms.create('fetchServiceNowData', {
        periodInMinutes: 0.1667
    });
}

// Funkce pro zastavení monitorování
function stopMonitoring() {
    console.log('Stopping monitoring');
    isMonitoring = false;
    chrome.alarms.clear('fetchServiceNowData');
    lastTicketCount = 0;
    lastTicketIds = new Set();
}

// Načtení nastavení
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['monitorUrl', 'soundType', 'customSoundData']);
        console.log('Settings loaded:', result);
        monitoredUrl = result.monitorUrl || '';
        soundType = result.soundType || 'default.mp3';
        customSoundData = result.customSoundData || null;
        
        if (monitoredUrl) {
            startMonitoring();
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Inicializace při instalaci nebo aktualizaci
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Extension installed/updated');
    chrome.action.setBadgeText({ text: "0" });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    await ensureAudioTab();
    await loadSettings();
});

// posluchač pro aktivaci extension
chrome.action.onClicked.addListener(() => {
    console.log('Extension activated by click');
    fetchServiceNowData();
});

// posluchač pro zavření audio tabu
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === audioTabId) {
        audioTabId = null;
        // Pokud je monitoring aktivní, vytvoříme nový audio tab
        if (isMonitoring) {
            ensureAudioTab();
        }
    }
});

// Posluchač alarmu
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'fetchServiceNowData') {
        fetchServiceNowData();
    }
});

// Posluchač zpráv
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message.type);
    
    if (message.type === 'settingsUpdated') {
        loadSettings()
            .then(() => {
                if (monitoredUrl) {
                    startMonitoring();
                } else {
                    stopMonitoring();
                }
                sendResponse({success: true});
            })
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
});

// Vytvoření notifikace
function createNotification(tickets) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon192.png',
        title: 'New ServiceNow Tickets',
        message: `New tickets received: ${tickets.join(', ')}`
    });
}

// Automatické spuštění při startu prohlížeče
chrome.runtime.onStartup.addListener(async () => {
    console.log('Browser started - initializing extension');
    try {
        await ensureAudioTab(); // Nejprve zajistíme audio tab
        await loadSettings(); // Pak načteme nastavení
    } catch (error) {
        console.error('Error during browser startup:', error);
    }
});

// posluchač pro obnovení připojení
chrome.runtime.onConnect.addListener(() => {
    console.log('Connection established - checking monitoring status');
    if (!isMonitoring && monitoredUrl) {
        startMonitoring();
    }
}); 
