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
let criticalNotificationsEnabled = true; // defaultně zapnuto

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

        // Vylepšený regex pattern pro hledání tiketů
        const patterns = [
            // Hledání v tabulce s konkrétní třídou
            /<table[^>]*class="[^"]*list_table[^"]*"[\s\S]*?<\/table>/gi,
            // Hledání v list2_body divu
            /<div[^>]*class="[^"]*list2_body[^"]*"[\s\S]*?<\/div>/gi
        ];

        // Relevantní části HTML
        let relevantHtml = '';
        for (const pattern of patterns) {
            const matches = html.match(pattern);
            if (matches) {
                relevantHtml += matches.join('');
            }
        }

        // Pokud jsme našli relevantní části, hledáme v nich tikety
        if (relevantHtml) {
            const ticketPattern = /(?:number="((?:INC|ITASK|TASK|RITM|REQ|FTASK|SCTASK|PRB|CHG|PRBTASK|CTASK|PTASK)\d+)"|sys_id="([^"]+)"[^>]*>[\s\S]*?((?:INC|ITASK|TASK|RITM|REQ|FTASK|SCTASK|PRB|CHG|PRBTASK|CTASK|PTASK)\d+))/gi;
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
        // kontroa všech existujících tabů
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

        // Načteme nastavení zvuku
        const settings = await chrome.storage.sync.get(['soundType']);
        const soundType = settings.soundType || 'default.mp3';

        if (soundType === 'custom') {
            // Pro custom zvuk načteme data z local storage
            const customSound = await chrome.storage.local.get(['customSoundData']);
            if (!customSound.customSoundData) {
                console.warn('Custom sound data not found, using default sound');
                await chrome.tabs.sendMessage(tabId, {
                    type: 'playSound',
                    soundType: 'default.mp3'
                });
                // Aktualizujeme nastavení na výchozí zvuk
                await chrome.storage.sync.set({ soundType: 'default.mp3' });
                return;
            }
            
            // Odešleme zprávu do audio tabu s custom daty
            await chrome.tabs.sendMessage(tabId, {
                type: 'playSound',
                soundType: 'custom',
                customSoundData: customSound.customSoundData
            });
        } else {
            // Pro standardní zvuky
            await chrome.tabs.sendMessage(tabId, {
                type: 'playSound',
                soundType: soundType
            });
        }
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

// Funkce pro extrakci detailů tiketu z HTML
function extractTicketDetails(html, ticketNumber) {
    try {
        const details = {
            number: ticketNumber,
            priority: '',
            state: '',
            assignedTo: '',
            shortDescription: '',
            category: '',
            updatedOn: '',
            isCritical: false
        };

        // Hledáme řádek s tiketem - vylepšený regex
        const rowRegex = new RegExp(`<tr[^>]*?>[\\s\\S]*?${ticketNumber}[\\s\\S]*?</tr>`, 'i');
        const ticketRow = html.match(rowRegex);
        
        if (ticketRow) {
            const row = ticketRow[0];
            
            // Hledání v data atributech
            const dataAttrs = row.match(/data-list-data="([^"]*)"/);
            if (dataAttrs) {
                try {
                    const jsonData = JSON.parse(decodeURIComponent(dataAttrs[1]));
                    
                    // Priority - zkusíme různé možnosti
                    details.priority = jsonData.priority_label || 
                                     jsonData.priority || 
                                     jsonData.urgency_label || 
                                     jsonData.urgency || '';

                    // Převod číselné priority na text a kontrola kritické priority
                    if (details.priority.match(/^[1-5]$/)) {
                        const priorityMap = {
                            '1': 'Critical',
                            '2': 'High',
                            '3': 'Moderate',
                            '4': 'Low',
                            '5': 'Planning'
                        };
                        details.priority = priorityMap[details.priority] || details.priority;
                    }
                    
                    // Kontrola kritické priority
                    details.isCritical = details.priority === 'Critical' || 
                                       details.priority === '1' || 
                                       details.priority.toLowerCase().includes('critical') ||
                                       jsonData.priority === '1' ||
                                       jsonData.urgency === '1';

                    details.state = jsonData.state_label || jsonData.state || '';
                    details.assignedTo = jsonData.assigned_to_label || jsonData.assigned_to || '';
                    details.shortDescription = jsonData.short_description || '';
                } catch (e) {
                    console.error('Error parsing JSON data:', e);
                }
            }

            // Pokud nemáme data z JSON, zkusíme najít v buňkách tabulky
            if (!details.priority) {
                const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
                cells.forEach(cell => {
                    const cellContent = cell.replace(/<[^>]*>/g, '').trim();
                    // Hledáme prioritu ve všech možných atributech
                    if (cell.includes('priority') || 
                        cell.includes('urgency') || 
                        cell.toLowerCase().includes('priority') ||
                        cell.match(/\b[1-5]\b/)) {
                        details.priority = cellContent;
                        // Kontrola kritické priority v buňce
                        details.isCritical = cellContent === '1' || 
                                           cellContent.toLowerCase().includes('critical') ||
                                           cell.toLowerCase().includes('critical');
                    }
                });
            }
        }

        return details;
    } catch (error) {
        console.error('Error extracting ticket details:', error);
        return { number: ticketNumber, isCritical: false };
    }
}

// Funkce pro vytvoření webové notifikace
function createWebNotification(ticketDetails) {
    try {
        const container = document.createElement('div');
        container.className = 'snq-notification';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #1a237e, #0d47a1);
            color: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 999999;
            width: 300px;
            font-family: Arial, sans-serif;
            animation: slideIn 0.5s ease-out;
        `;

        // Přidáme styl pro animaci
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .snq-notification {
                transition: opacity 0.3s ease-out;
            }
            .snq-notification.hiding {
                opacity: 0;
            }
        `;
        document.head.appendChild(style);

        // Vytvoříme obsah notifikace
        const title = document.createElement('div');
        title.style.cssText = `
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 8px;
            color: #90caf9;
        `;
        title.textContent = `${ticketDetails.priority ? `[${ticketDetails.priority}] ` : ''}${ticketDetails.number}`;

        const content = document.createElement('div');
        content.style.cssText = `
            font-size: 14px;
            line-height: 1.4;
        `;

        // Sestavíme obsah zprávy
        let messageContent = '';
        if (ticketDetails.state) messageContent += `Stav: ${ticketDetails.state}\n`;
        if (ticketDetails.assignedTo) messageContent += `Přiřazeno: ${ticketDetails.assignedTo}\n`;
        if (ticketDetails.shortDescription) {
            const maxLength = 100;
            messageContent += details.shortDescription.length > maxLength 
                ? details.shortDescription.substring(0, maxLength) + '...'
                : details.shortDescription;
        }

        content.textContent = messageContent;

        // Přidáme tlačítko pro otevření tiketu
        const button = document.createElement('button');
        button.textContent = 'Otevřít tiket';
        button.style.cssText = `
            background: #1976d2;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            margin-top: 10px;
            cursor: pointer;
            width: 100%;
            font-weight: bold;
            transition: background-color 0.2s;
        `;
        button.onmouseover = () => button.style.backgroundColor = '#1565c0';
        button.onmouseout = () => button.style.backgroundColor = '#1976d2';

        // Sestavíme notifikaci
        container.appendChild(title);
        container.appendChild(content);
        container.appendChild(button);
        document.body.appendChild(container);

        // Přidáme funkcionalitu tlačítka
        button.onclick = () => {
            const baseUrl = new URL(monitoredUrl).origin;
            const ticketUrl = getTicketUrl(baseUrl, ticketDetails.number);
            chrome.tabs.create({ url: ticketUrl });
            container.remove();
        };

        // Automatické zavření po 10 sekundách
        setTimeout(() => {
            container.classList.add('hiding');
            setTimeout(() => container.remove(), 300);
        }, 10000);

    } catch (error) {
        console.error('Error creating web notification:', error);
    }
}

// Upravená funkce createNotification
function createNotification(tickets, html) {
    if (!Array.isArray(tickets)) {
        console.error('Invalid tickets data:', tickets);
        return;
    }

    tickets.forEach(async ticket => {
        const ticketNumber = typeof ticket === 'string' ? ticket : ticket.number;
        if (!ticketNumber) {
            console.error('Invalid ticket data:', ticket);
            return;
        }

        // Získáme detaily tiketu
        const details = extractTicketDetails(html, ticketNumber);
        const notificationId = `ticket_${ticketNumber}_${Date.now()}`;

        // Vytvoříme systémovou notifikaci
        let title = `New ticket: ${ticketNumber}`;
        if (details.priority) {
            title = `[${details.priority}] ${ticketNumber}`;
        }

        let message = '';
        let firstLine = [];
        if (details.state) firstLine.push(details.state);
        if (details.assignedTo) firstLine.push(`-> ${details.assignedTo}`);
        if (firstLine.length > 0) {
            message = firstLine.join(' ');
        }

        if (details.shortDescription) {
            if (message) message += '\n';
            const maxLength = 100;
            message += details.shortDescription.length > maxLength 
                ? details.shortDescription.substring(0, maxLength) + '...'
                : details.shortDescription;
        }

        if (!message) {
            message = ticketNumber;
        }

        // Vytvoříme systémovou notifikaci
        chrome.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: 'icons/icon192.png',
            title: title,
            message: message,
            buttons: [{
                title: 'Open ticket'
            }]
        });

        // Odešleme zprávu do content scriptu pro zobrazení webové notifikace POUZE pokud:
        // 1. Je tiket kritický
        // 2. Jsou povoleny kritické notifikace
        if (details.isCritical && criticalNotificationsEnabled) {
            try {
                // Nejprve najdeme aktivní tab
                const activeTabs = await chrome.tabs.query({
                    active: true,
                    currentWindow: true
                });
                
                // Pokud máme aktivní tab a je na service-now.com, zobrazíme notifikaci tam
                if (activeTabs.length > 0 && activeTabs[0].url && activeTabs[0].url.includes('service-now.com')) {
                    console.log('Sending notification to active tab:', activeTabs[0].id);
                    try {
                        await chrome.tabs.sendMessage(activeTabs[0].id, {
                            type: 'showWebNotification',
                            ticketDetails: details
                        });
                        console.log('Notification sent to active tab successfully');
                    } catch (err) {
                        console.log('Failed to send to active tab, trying to inject content script');
                        // Pokud selže odeslání zprávy, zkusíme znovu injektovat content script
                        await chrome.scripting.executeScript({
                            target: { tabId: activeTabs[0].id },
                            files: ['content.js']
                        });
                        // Zkusíme znovu poslat zprávu
                        await chrome.tabs.sendMessage(activeTabs[0].id, {
                            type: 'showWebNotification',
                            ticketDetails: details
                        });
                    }
                } else {
                    // Pokud aktivní tab není service-now.com, najdeme první service-now tab
                    console.log('Active tab is not ServiceNow, searching for ServiceNow tabs');
                    const allTabs = await chrome.tabs.query({url: '*://*.service-now.com/*'});
                    if (allTabs.length > 0) {
                        console.log('Found ServiceNow tab:', allTabs[0].id);
                        // Aktivujeme první service-now tab a zobrazíme na něm notifikaci
                        await chrome.tabs.update(allTabs[0].id, {active: true});
                        await chrome.windows.update(allTabs[0].windowId, {focused: true});
                        try {
                            await chrome.tabs.sendMessage(allTabs[0].id, {
                                type: 'showWebNotification',
                                ticketDetails: details
                            });
                            console.log('Notification sent to ServiceNow tab successfully');
                        } catch (err) {
                            console.log('Failed to send to ServiceNow tab, trying to inject content script');
                            // Pokud selže odeslání zprávy, zkusíme znovu injektovat content script
                            await chrome.scripting.executeScript({
                                target: { tabId: allTabs[0].id },
                                files: ['content.js']
                            });
                            // Zkusíme znovu poslat zprávu
                            await chrome.tabs.sendMessage(allTabs[0].id, {
                                type: 'showWebNotification',
                                ticketDetails: details
                            });
                        }
                    } else {
                        console.log('No ServiceNow tabs found');
                    }
                }
            } catch (error) {
                console.error('Error sending message to content script:', error);
            }
        }

        // Uložení informací o tiketu
        ticketUrls.set(notificationId, {
            number: ticketNumber
        });
    });
}

// Přidáme Map pro ukládání URL tiketů
const ticketUrls = new Map();

// Funkce pro získání správné URL pro tiket
function getTicketUrl(baseUrl, ticketNumber) {
    // Určení typu tiketu podle prefixu
    const prefix = ticketNumber.substring(0, 3).toUpperCase();
    let table;
    
    switch (prefix) {
        case 'INC': // Incident
            if (ticketNumber.includes('TASK')) {
                table = 'incident_task'; // Incident Task
            } else {
                table = 'incident'; // Standard Incident
            }
            break;
        case 'ITA': // ITASK
            table = 'incident_task';
            break;
        case 'RIT': // Request Item
            table = 'sc_req_item';
            break;
        case 'REQ': // Request
            table = 'sc_request';
            break;
        case 'FTA': // Facilities Task
            table = 'facilities_task';
            break;
        case 'SCT': // Service Catalog Task
            table = 'sc_task';
            break;
        case 'CTA': // Change Task
            table = 'change_task';
            break;
        case 'CHG': // Change Request
            table = 'change_request';
            break;
        case 'PRB': // Problem
            table = 'problem';
            break;
        case 'PRT': // Problem Task
            table = 'problem_task';
            break;
        case 'TAS': // Task
            table = 'task';
            break;
        case 'CTS': // Change Task
            table = 'change_task';
            break;
        case 'SRT': // Service Request Task
            table = 'sc_task';
            break;
        default:
            // Pro neznámé typy použijeme obecný task
            table = 'task';
    }
    
    // Přidáme parametr sysparm_view=1 pro lepší kompatibilitu
    return `${baseUrl}/${table}.do?sysparm_query=number=${ticketNumber}&sysparm_view=1`;
}

// Přidáme posluchač pro kliknutí na notifikaci
chrome.notifications.onClicked.addListener((notificationId) => {
    const ticketInfo = ticketUrls.get(notificationId);
    if (ticketInfo) {
        // Vytvoříme URL pro otevření tiketu
        const baseUrl = new URL(monitoredUrl).origin;
        const ticketUrl = getTicketUrl(baseUrl, ticketInfo.number);
        
        // Otevřeme tiket v novém tabu
        chrome.tabs.create({ url: ticketUrl });
        
        // Zavřeme notifikaci
        chrome.notifications.clear(notificationId);
        
        // Vyčistíme URL z mapy
        ticketUrls.delete(notificationId);
    }
});

// Přidáme posluchač pro kliknutí na tlačítko v notifikaci
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 0) { // "Otevřít tiket" tlačítko
        const ticketInfo = ticketUrls.get(notificationId);
        if (ticketInfo) {
            const baseUrl = new URL(monitoredUrl).origin;
            const ticketUrl = getTicketUrl(baseUrl, ticketInfo.number);
            chrome.tabs.create({ url: ticketUrl });
            chrome.notifications.clear(notificationId);
            ticketUrls.delete(notificationId);
        }
    }
});

// Přidáme posluchač pro zavření notifikace
chrome.notifications.onClosed.addListener((notificationId) => {
    ticketUrls.delete(notificationId);
});

// Automatické spuštění při startu prohlížeče
chrome.runtime.onStartup.addListener(async () => {
    console.log('Browser started - initializing extension');
    try {
        await ensureAudioTab(); // Nejprve zajistíme audio tab
        await loadSettings(); // Pak načteme nastavení
        
        // Pokud máme uloženou URL, okamžitě začneme monitorovat
        if (monitoredUrl) {
            console.log('Stored URL found, starting monitoring:', monitoredUrl);
            startMonitoring();
            // Okamžitá kontrola dat
            fetchServiceNowData();
        }
    } catch (error) {
        console.error('Error during browser startup:', error);
    }
});

//  obnovení připojení
chrome.runtime.onConnect.addListener(() => {
    console.log('Connection established - checking monitoring status');
    if (!isMonitoring && monitoredUrl) {
        startMonitoring();
    }
});

// Funkce pro získání dat ze ServiceNow
async function fetchServiceNowData() {
    if (!monitoredUrl) {
        console.log('No URL configured');
        chrome.action.setBadgeText({ text: "?" });
        return;
    }

    try {
        console.log('Fetching data from:', monitoredUrl);
        
        const urlWithParams = new URL(monitoredUrl);
        urlWithParams.searchParams.set('sysparm_timestamp', Date.now().toString());
        
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

        // Aktualizace badge
        updateBadge(currentCount);

        // Kontrola nových tiketů
        if (lastTicketCount !== 0 && currentCount > lastTicketCount) {
            console.log(`Ticket count increased from ${lastTicketCount} to ${currentCount}`);
            
            // Přehrání zvuku
            await playSound();
            
            // Vytvoření notifikace pro nové tikety s HTML daty
            const newTickets = [...currentTickets].filter(id => !lastTicketIds.has(id));
            if (newTickets.length > 0) {
                createNotification(newTickets, html);
            }
        }

        lastTicketCount = currentCount;
        lastTicketIds = currentTickets;
        lastCheckTime = Date.now();
        retryCount = 0;

    } catch (error) {
        console.error('Error fetching ServiceNow data:', error);
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
        
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            setTimeout(fetchServiceNowData, RETRY_DELAY);
        }
    }
}

// Pomocná funkce pro získání user tokenu
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
    
    if (!monitoredUrl) {
        console.warn('Cannot start monitoring - no URL configured');
        return;
    }

    try {
        // Ověření platnosti URL
        new URL(monitoredUrl);
    } catch (error) {
        console.error('Invalid monitoring URL:', error);
        return;
    }
    
    console.log('Starting monitoring for URL:', monitoredUrl);
    isMonitoring = true;
    
    // počáteční stav
    lastTicketCount = 0;
    lastTicketIds = new Set();
    
    // Okamžitá první kontrola
    fetchServiceNowData();
    
    // Nastavení intervalu pro pravidelnou kontrolu
    chrome.alarms.create('fetchServiceNowData', {
        periodInMinutes: 0.1667 // 10 sekund
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
        const result = await chrome.storage.sync.get([
            'monitorUrl', 
            'soundType', 
            'criticalNotificationsEnabled'
        ]);
        
        console.log('Settings loaded:', result);
        
        // Kontrola a nastavení monitorované URL
        if (result.monitorUrl) {
            try {
                // Ověření platnosti URL
                new URL(result.monitorUrl);
                monitoredUrl = result.monitorUrl;
                console.log('Valid monitoring URL loaded:', monitoredUrl);
            } catch (error) {
                console.error('Invalid monitoring URL in settings:', error);
                monitoredUrl = '';
            }
        } else {
            console.log('No monitoring URL configured');
            monitoredUrl = '';
        }
        
        // Nastavení zvuku
        soundType = result.soundType || 'default.mp3';
        criticalNotificationsEnabled = result.criticalNotificationsEnabled !== false;
        
        // Pokud je vybrán custom zvuk, ověříme, že existuje
        if (soundType === 'custom') {
            const customSound = await chrome.storage.local.get(['customSoundData']);
            if (!customSound.customSoundData) {
                console.warn('Custom sound data not found, reverting to default');
                soundType = 'default.mp3';
                await chrome.storage.sync.set({ soundType: 'default.mp3' });
            }
        }
        
        // Spustíme monitoring pouze pokud máme platnou URL
        if (monitoredUrl) {
            console.log('Starting monitoring after settings load');
            startMonitoring();
        } else {
            console.log('Monitoring not started - no valid URL');
            stopMonitoring();
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        stopMonitoring();
    }
}

// Inicializace při instalaci nebo aktualizaci
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('Extension installed/updated:', details.reason);
    chrome.action.setBadgeText({ text: "0" });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // Načteme nastavení a spustíme monitoring
    await ensureAudioTab();
    await loadSettings();
    
    // Pokud je to update, zkontrolujeme okamžitě data
    if (details.reason === 'update' && monitoredUrl) {
        fetchServiceNowData();
    }
});

//  posluchač pro aktivaci extension
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
    console.log('Received message:', message.type, message);
    
    if (message.type === 'settingsUpdated') {
        console.log('Settings updated, reloading...');
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
    } else if (message.type === 'newTickets') {
        // Zpracování nových tiketů
        if (message.tickets && Array.isArray(message.tickets)) {
            createNotification(message.tickets);
        }
        return true;
    }
}); 