let observer = null;
let lastTicketCount = 0;
let lastTicketIds = new Set();
let monitoredUrl = '';
let isInitialized = false;

// Konfigurace
const CONFIG = {
    REFRESH_INTERVAL: 5000,
    INITIAL_RETRY_INTERVAL: 1000,
    MAX_RETRY_ATTEMPTS: 5,
    SELECTORS: {
        TICKET_TABLE: 'table.list_table',
        TICKET_ROWS: 'tr.list_row',
        TICKET_LINK: 'a.linked'
    },
    TICKET_PATTERN: /^(INC|ITASK|TASK|RITM|REQ|FTASK|SCTASK|PRB|CHG|PRBTASK|CTASK|PTASK)[0-9]+$/i
};

// Pomocné funkce
function log(message, ...args) {
    console.log(`[ServiceNow Monitor] ${message}`, ...args);
}

function error(message, ...args) {
    console.error(`[ServiceNow Monitor] ${message}`, ...args);
}

// Načtení nastavení
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['monitorUrl']);
        monitoredUrl = result.monitorUrl || '';
        log('Načtena monitorovaná URL:', monitoredUrl);
    } catch (error) {
        error('Chyba při načítání nastavení:', error);
    }
}

// Získání tiketů
function getTickets() {
    const tickets = new Set();
    try {
        const tables = document.querySelectorAll(CONFIG.SELECTORS.TICKET_TABLE);
        tables.forEach(table => {
            const rows = table.querySelectorAll(CONFIG.SELECTORS.TICKET_ROWS);
            rows.forEach(row => {
                const link = row.querySelector(CONFIG.SELECTORS.TICKET_LINK);
                if (link) {
                    const number = link.textContent.trim();
                    if (CONFIG.TICKET_PATTERN.test(number)) {
                        tickets.add(number);
                        log(`Nalezen tiket: ${number}`);
                    }
                }
            });
        });
    } catch (err) {
        error('Chyba při získávání tiketů:', err);
    }
    return tickets;
}

// Kontrola, zda jsme na správné URL
function shouldMonitorPage() {
    try {
        if (!monitoredUrl) {
            return false;
        }

        const currentUrl = new URL(window.location.href);
        const targetUrl = new URL(monitoredUrl);

        // Kontrola, zda jsme na stejné doméně a cestě
        return currentUrl.origin === targetUrl.origin &&
               currentUrl.pathname === targetUrl.pathname &&
               currentUrl.search === targetUrl.search;
    } catch (error) {
        error('Chyba při kontrole URL:', error);
        return false;
    }
}

// Kontrola nových tiketů
async function checkForNewTickets() {
    // Kontrola, zda jsme na správné stránce
    if (!shouldMonitorPage()) {
        return;
    }

    try {
        const currentTickets = getTickets();
        const currentCount = currentTickets.size;

        log(`Aktuální počet tiketů: ${currentCount}`);
        log('Poslední známý počet:', lastTicketCount);

        // Kontrola nových tiketů
        if (lastTicketCount > 0 && currentCount > lastTicketCount) {
            const newTickets = Array.from(currentTickets)
                .filter(number => !lastTicketIds.has(number));

            if (newTickets.length > 0) {
                log('Nové tikety:', newTickets);
                try {
                    await chrome.runtime.sendMessage({
                        type: 'newTickets',
                        tickets: newTickets
                    });
                } catch (e) {
                    error('Nelze odeslat notifikaci o nových tiketech:', e);
                }
            }
        }

        lastTicketCount = currentCount;
        lastTicketIds = currentTickets;

    } catch (err) {
        error('Chyba při kontrole tiketů:', err);
    }
}

// Start monitorování
async function startMonitoring() {
    if (isInitialized) {
        return;
    }

    log('Spouštím monitoring');
    await loadSettings();

    // Kontrola, zda jsme na správné stránce před spuštěním monitorování
    if (!shouldMonitorPage()) {
        log('Tato stránka není cílem monitoringu');
        return;
    }

    // Interval pro kontrolu
    setInterval(() => {
        checkForNewTickets();
    }, CONFIG.REFRESH_INTERVAL);

    isInitialized = true;
    
    // První kontrola
    checkForNewTickets();
}

// Spustit monitoring při načtení stránky
startMonitoring();

// Funkce pro vytvoření webové notifikace
function showWebNotification(ticketDetails) {
    try {
        // Nejprve zkontrolujeme, zda již neexistuje notifikace pro tento tiket
        const existingNotification = document.querySelector(`.snq-notification[data-ticket="${ticketDetails.number}"]`);
        if (existingNotification) {
            return; // Pokud již existuje, nevytváříme novou
        }

        const container = document.createElement('div');
        container.className = 'snq-notification';
        container.setAttribute('data-ticket', ticketDetails.number);
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #d32f2f, #b71c1c);
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 6px 16px rgba(211, 47, 47, 0.4),
                       0 0 0 1px rgba(255, 255, 255, 0.1);
            z-index: 999999;
            width: 320px;
            font-family: 'Segoe UI', Arial, sans-serif;
            animation: slideIn 0.5s ease-out, pulse 2s infinite;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transform-origin: bottom right;
        `;

        // Přidáme styl pro animaci
        if (!document.getElementById('snq-notification-style')) {
            const style = document.createElement('style');
            style.id = 'snq-notification-style';
            style.textContent = `
                @keyframes slideIn {
                    from { 
                        transform: translateX(100%) scale(0.8); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateX(0) scale(1); 
                        opacity: 1; 
                    }
                }
                @keyframes pulse {
                    0% { 
                        box-shadow: 0 6px 16px rgba(211, 47, 47, 0.4),
                                  0 0 0 1px rgba(255, 255, 255, 0.1);
                    }
                    50% { 
                        box-shadow: 0 8px 24px rgba(211, 47, 47, 0.6),
                                  0 0 0 1px rgba(255, 255, 255, 0.2);
                    }
                    100% { 
                        box-shadow: 0 6px 16px rgba(211, 47, 47, 0.4),
                                  0 0 0 1px rgba(255, 255, 255, 0.1);
                    }
                }
                .snq-notification {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .snq-notification.hiding {
                    transform: translateX(100%) scale(0.8);
                    opacity: 0;
                }
                .snq-notification:hover {
                    transform: translateY(-2px) scale(1.02);
                }
            `;
            document.head.appendChild(style);
        }

        // Vytvoříme obsah notifikace
        const title = document.createElement('div');
        title.style.cssText = `
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 12px;
            color: #ffcdd2;
            display: flex;
            align-items: center;
            gap: 10px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            letter-spacing: 0.3px;
        `;

        // Přidáme ikonu výstrahy
        const warningIcon = document.createElement('span');
        warningIcon.textContent = '⚠️';
        warningIcon.style.cssText = `
            font-size: 22px;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        `;
        title.appendChild(warningIcon);

        const titleText = document.createElement('span');
        titleText.textContent = `CRITICAL TICKET: ${ticketDetails.number}`;
        title.appendChild(titleText);

        const content = document.createElement('div');
        content.style.cssText = `
            font-size: 14px;
            line-height: 1.5;
            background: rgba(255, 255, 255, 0.1);
            padding: 12px;
            border-radius: 8px;
            margin: 12px 0;
            border: 1px solid rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(5px);
        `;

        // Sestavíme obsah zprávy
        let messageContent = '';
        if (ticketDetails.state) messageContent += `Status: ${ticketDetails.state}\n`;
        if (ticketDetails.assignedTo) messageContent += `Assigned to: ${ticketDetails.assignedTo}\n`;
        if (ticketDetails.shortDescription) {
            const maxLength = 100;
            messageContent += `Description: ${ticketDetails.shortDescription.length > maxLength 
                ? ticketDetails.shortDescription.substring(0, maxLength) + '...'
                : ticketDetails.shortDescription}`;
        }

        content.textContent = messageContent;

        // Přidáme tlačítka pro otevření tiketu a zavření notifikace
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            margin-top: 15px;
        `;

        const openButton = document.createElement('button');
        openButton.textContent = 'Open Critical Ticket';
        openButton.style.cssText = `
            background: linear-gradient(135deg, #ff5252, #ff1744);
            color: white;
            border: none;
            padding: 12px 18px;
            border-radius: 6px;
            cursor: pointer;
            flex: 2;
            font-weight: 600;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 13px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        `;
        openButton.onmouseover = () => {
            openButton.style.transform = 'translateY(-2px)';
            openButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        };
        openButton.onmouseout = () => {
            openButton.style.transform = 'translateY(0)';
            openButton.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
        };

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.cssText = `
            background: rgba(255, 255, 255, 0.15);
            color: white;
            border: none;
            padding: 12px 18px;
            border-radius: 6px;
            cursor: pointer;
            flex: 1;
            font-weight: 600;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 13px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(5px);
        `;
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
            closeButton.style.transform = 'translateY(-2px)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            closeButton.style.transform = 'translateY(0)';
        };

        // Sestavíme notifikaci
        container.appendChild(title);
        container.appendChild(content);
        buttonContainer.appendChild(openButton);
        buttonContainer.appendChild(closeButton);
        container.appendChild(buttonContainer);
        document.body.appendChild(container);

        // Přidáme zvukový efekt pro kritický tiket - zkrácený na 4s
        const audio = new Audio(chrome.runtime.getURL('sounds/notification.mp3'));
        audio.volume = 1.0;
        let startTime = 0;
        audio.addEventListener('timeupdate', () => {
            if (audio.currentTime - startTime >= 4) {
                audio.pause();
            }
        });
        audio.play().catch(err => console.log('Audio play failed:', err));

        // Přidáme funkcionalitu tlačítek
        openButton.onclick = () => {
            // Určení typu tiketu podle prefixu
            const prefix = ticketDetails.number.substring(0, 3).toUpperCase();
            let table;
            
            switch (prefix) {
                case 'INC': // Incident
                    if (ticketDetails.number.includes('TASK')) {
                        table = 'incident_task';
                    } else {
                        table = 'incident';
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
                    table = 'task';
            }

            const ticketUrl = `${window.location.origin}/${table}.do?sysparm_query=number=${ticketDetails.number}&sysparm_view=1`;
            window.open(ticketUrl, '_blank');
            container.remove();
        };

        closeButton.onclick = () => {
            container.classList.add('hiding');
            setTimeout(() => container.remove(), 300);
        };

    } catch (error) {
        console.error('Error creating web notification:', error);
    }
}

// Přidáme posluchač pro zprávy od background scriptu
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    if (message.type === 'showWebNotification') {
        console.log('Showing web notification for ticket:', message.ticketDetails);
        showWebNotification(message.ticketDetails);
        // Potvrdíme background scriptu, že notifikace byla zobrazena
        sendResponse({ success: true });
    }
    return true; // Indikuje asynchronní odpověď
});

// Oznámíme background scriptu, že content script je připraven
chrome.runtime.sendMessage({ type: 'contentScriptReady' }, response => {
    console.log('Content script ready message sent');
});

console.log('ServiceNow Queue Monitor content script loaded'); 