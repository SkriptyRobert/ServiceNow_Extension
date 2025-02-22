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
        TICKET_TABLE: 'table.list_table, div.list2_body, table[id^="task_table"], table.list_table_all, div[class*="list2-table"]',
        TICKET_ROWS: 'tr.list_row, tr[data-type="list2_row"], tr.list_row_select, tr[data-list-row="true"], tr[record_class], tr[sys_id]',
        TICKET_LINK: 'a.linked, a[href*="task.do"], a[href*="incident.do"], a[href*="sc_req_item.do"], a[href*="sc_request.do"]',
        REFRESH_BUTTON: 'button[id*="refresh"], a[id*="refresh"], button.list_refresh_button, button[name="refresh"]',
        FRAME_CONTAINER: 'gsft_main'
    },
    TICKET_PATTERN: /^(INC|TASK|RITM|REQ|FTASK|SCTASK)[0-9]+$/i
};

// Pomocné funkce
function log(message, ...args) {
    console.log(`[ServiceNow Monitor] ${message}`, ...args);
}

function error(message, ...args) {
    console.error(`[ServiceNow Monitor] ${message}`, ...args);
}

function debugDOM() {
    log('Debug DOM struktura:');
    log('Hledám tabulku:', CONFIG.SELECTORS.TICKET_TABLE);
    const tables = document.querySelectorAll(CONFIG.SELECTORS.TICKET_TABLE);
    log(`Nalezeno ${tables.length} tabulek`);
    
    tables.forEach((table, index) => {
        log(`Tabulka ${index + 1}:`, table);
        const rows = table.querySelectorAll(CONFIG.SELECTORS.TICKET_ROWS);
        log(`- Počet řádků: ${rows.length}`);
        
        rows.forEach((row, rowIndex) => {
            const links = row.querySelectorAll(CONFIG.SELECTORS.TICKET_LINK);
            if (links.length > 0) {
                links.forEach(link => {
                    log(`-- Řádek ${rowIndex + 1}, Tiket: ${link.textContent.trim()}`);
                });
            }
        });
    });
}

// Načtení nastavení
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['monitorUrl']);
        monitoredUrl = result.monitorUrl || '';
        console.log('Loaded monitored URL:', monitoredUrl);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Kontrola, zda sledovat aktuální stránku
function shouldMonitorPage() {
    log('Kontrola URL:', window.location.href);
    if (!monitoredUrl) {
        log('Není nastavena monitorovaná URL');
        return false;
    }
    
    try {
        const currentUrl = new URL(window.location.href);
        const targetUrl = new URL(monitoredUrl);

        log('Aktuální URL:', currentUrl.toString());
        log('Cílová URL:', targetUrl.toString());

        // Kontrola základních částí URL - volnější podmínky
        if (currentUrl.hostname !== targetUrl.hostname) {
            log('Neshoduje se hostname');
            return false;
        }

        // Kontrola, zda jsme na správné stránce
        if (!currentUrl.pathname.includes('task_list.do') && 
            !currentUrl.pathname.includes('incident_list.do') && 
            !currentUrl.pathname.includes('sc_req_item_list.do')) {
            log('Nejsme na správné stránce');
            return false;
        }

        log('Stránka je validní pro monitoring');
        return true;
    } catch (error) {
        error('Chyba při kontrole URL:', error);
        return false;
    }
}

// Funkce pro získání ServiceNow kontextu
function getServiceNowContext() {
    try {
        const frame = document.getElementById(CONFIG.SELECTORS.FRAME_CONTAINER);
        if (frame && frame.contentWindow) {
            const win = frame.contentWindow;
            return {
                window: win,
                document: win.document,
                g_list: win.g_list,
                GlideList2: win.GlideList2,
                jQuery: win.jQuery
            };
        }
    } catch (err) {
        log('Nelze získat ServiceNow kontext, používám hlavní okno');
    }
    return {
        window: window,
        document: document,
        g_list: window.g_list,
        GlideList2: window.GlideList2,
        jQuery: window.jQuery
    };
}

// Funkce pro získání aktuálního seznamu tiketů
function getListObject() {
    const context = getServiceNowContext();
    try {
        // Zkusíme získat objekt seznamu různými způsoby
        if (context.g_list) {
            return context.g_list;
        }
        
        if (context.GlideList2) {
            const listId = context.document.querySelector('[data-list_id]')?.getAttribute('data-list_id');
            if (listId) {
                return context.GlideList2.get(listId);
            }
        }
    } catch (err) {
        error('Chyba při získávání objektu seznamu:', err);
    }
    return null;
}

// Nová funkce pro získání GlideList2 objektu
function getGlideList2() {
    const context = getServiceNowContext();
    try {
        if (context.GlideList2) {
            // Zkusíme najít ID seznamu různými způsoby
            const listId = context.document.querySelector('[data-list_id]')?.getAttribute('data-list_id') ||
                          context.document.querySelector('.list_div')?.getAttribute('id') ||
                          context.document.querySelector('div[data-type="list2_container"]')?.getAttribute('id');
            
            if (listId) {
                return context.GlideList2.get(listId);
            }
            
            // Pokud nemáme ID, zkusíme najít první instanci
            const lists = context.GlideList2.getAll();
            if (lists && lists.length > 0) {
                return lists[0];
            }
        }
    } catch (err) {
        error('Chyba při získávání GlideList2:', err);
    }
    return null;
}

// Vylepšená funkce pro kontrolu platnosti kontextu
function isExtensionContextValid() {
    try {
        // Kontrola přístupu k chrome API
        if (!chrome || !chrome.runtime || !chrome.runtime.id) {
            return false;
        }
        
        // Kontrola, zda jsme na správné stránce
        if (!shouldMonitorPage()) {
            return false;
        }
        
        // Kontrola, zda máme přístup k DOM
        if (!document || !document.body) {
            return false;
        }
        
        return true;
    } catch (e) {
        error('Chyba při kontrole kontextu:', e);
        return false;
    }
}

// Zjednodušená funkce pro aktualizaci dat
async function refreshListData() {
    const context = getServiceNowContext();
    try {
        // Použijeme GlideList2, pokud je dostupný
        const list2 = getGlideList2();
        if (list2 && typeof list2.refresh === 'function') {
            log('Aktualizuji data pomocí GlideList2');
            list2.refresh();
            return true;
        }

        // Pokud GlideList2 není dostupný, použijeme AJAX
        if (context.jQuery) {
            log('Aktualizuji data pomocí AJAX');
            const currentUrl = new URL(context.window.location.href);
            await context.jQuery.ajax({
                url: currentUrl.pathname + currentUrl.search,
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    'X-UserToken': context.window.g_ck || '',
                },
                data: {
                    sysparm_refresh: true,
                    sysparm_timestamp: Date.now()
                }
            });
            return true;
        }

        return false;
    } catch (err) {
        error('Chyba při aktualizaci dat:', err);
        return false;
    }
}

// Vylepšená funkce pro zpracování změn
function handleChanges() {
    if (!isExtensionContextValid()) {
        error('Neplatný kontext extension');
        return;
    }

    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }
    
    debounceTimeout = setTimeout(async () => {
        if (!isProcessing) {
            isProcessing = true;
            try {
                const refreshSuccess = await refreshListData();
                if (refreshSuccess) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await checkForNewTickets(false);
                }
            } catch (e) {
                error('Chyba při zpracování změn:', e);
                // Pokud je kontext neplatný, restartujeme monitoring
                if (!isExtensionContextValid()) {
                    isInitialized = false;
                    startMonitoring();
                }
            } finally {
                isProcessing = false;
            }
        }
    }, 300);
}

// Vylepšená funkce pro získání tiketů
function getTickets() {
    const context = getServiceNowContext();
    const tickets = new Set();
    
    try {
        // Nejprve zkusíme získat data přímo ze seznamu
        const list = getListObject();
        if (list) {
            const rows = list.getRows();
            if (rows) {
                rows.forEach(row => {
                    const number = row.getAttribute('data-number') || 
                                 row.querySelector('.list_decoration a, .linked')?.textContent?.trim();
                    if (number && CONFIG.TICKET_PATTERN.test(number)) {
                        tickets.add(number);
                        log(`Přidán tiket ze seznamu: ${number}`);
                    }
                });
            }
        }

        // Pokud nemáme data ze seznamu, použijeme DOM
        if (tickets.size === 0) {
            const tables = context.document.querySelectorAll(CONFIG.SELECTORS.TICKET_TABLE);
            tables.forEach((table, tableIndex) => {
                const rows = table.querySelectorAll(CONFIG.SELECTORS.TICKET_ROWS);
                rows.forEach((row, rowIndex) => {
                    const ticketLinks = row.querySelectorAll(CONFIG.SELECTORS.TICKET_LINK);
                    ticketLinks.forEach(link => {
                        const ticketText = link.textContent.trim();
                        if (CONFIG.TICKET_PATTERN.test(ticketText)) {
                            tickets.add(ticketText);
                            log(`Přidán tiket z DOM: ${ticketText}`);
                        }
                    });
                });
            });
        }

        log(`Celkový počet nalezených tiketů: ${tickets.size}`);
        return tickets;
    } catch (err) {
        error('Chyba při získávání tiketů:', err);
        return new Set();
    }
}

// Vylepšená kontrola nových tiketů
async function checkForNewTickets(forceRefreshData = false) {
    if (!isExtensionContextValid()) {
        error('Neplatný kontext extension při kontrole tiketů');
        return;
    }

    try {
        const currentTickets = getTickets();
        const currentCount = currentTickets.size;

        if (currentCount === 0) {
            log('Žádné tikety nenalezeny, možná je potřeba obnovit session');
            return;
        }

        log(`Aktuální počet tiketů: ${currentCount}`);
        log('Poslední známý počet:', lastTicketCount);

        // Aktualizovat badge pouze pokud je kontext platný
        try {
            await chrome.runtime.sendMessage({
                type: 'updateBadge',
                count: currentCount
            });
        } catch (e) {
            error('Nelze aktualizovat badge:', e);
            // Pokud je kontext neplatný, restartujeme monitoring
            if (!isExtensionContextValid()) {
                isInitialized = false;
                startMonitoring();
            }
            return;
        }

        // Kontrola nových tiketů
        if (lastTicketCount > 0 && currentCount > lastTicketCount) {
            const newTickets = [...currentTickets].filter(id => !lastTicketIds.has(id));
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
        if (!isExtensionContextValid()) {
            isInitialized = false;
            startMonitoring();
        }
    }
}

// Upravená inicializace sledování změn
function initializeObserver() {
    const context = getServiceNowContext();
    let isProcessing = false;

    // Funkce pro zpracování změn s debounce
    let debounceTimeout = null;
    function handleChanges() {
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(async () => {
            if (!isProcessing) {
                isProcessing = true;
                await refreshListData();  // Nejdřív aktualizujeme data
                await checkForNewTickets(false);
                isProcessing = false;
            }
        }, 300);
    }

    // Sledování ServiceNow událostí
    if (context.jQuery) {
        const events = [
            'glide:list.loaded',
            'glide:list.refresh',
            'glide:list_v2.loaded',
            'glide:list_v2.refresh',
            'list.loaded',
            'partial.page.reload',
            'list.refresh'
        ];
        
        events.forEach(event => {
            context.jQuery(context.document).on(event, () => {
                log(`Detekována událost: ${event}`);
                handleChanges();
            });
        });

        // Sledování AJAX požadavků
        context.jQuery(context.document).ajaxComplete((event, xhr, settings) => {
            if (settings.url && (
                settings.url.includes('ajax.do') || 
                settings.url.includes('list.do') ||
                settings.url.includes('task_list.do')
            )) {
                log('Detekován relevantní AJAX požadavek');
                handleChanges();
            }
        });
    }

    // Nastavení MutationObserver pro záložní detekci změn
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                return Array.from(mutation.addedNodes).some(node => {
                    return node.nodeType === 1 && (
                        node.matches?.(CONFIG.SELECTORS.TICKET_ROWS) ||
                        node.querySelector?.(CONFIG.SELECTORS.TICKET_LINK)
                    );
                });
            }
            return false;
        });

        if (hasRelevantChanges) {
            log('Detekována změna v DOM');
            handleChanges();
        }
    });

    // Sledujeme pouze relevantní části DOM
    const tables = context.document.querySelectorAll(CONFIG.SELECTORS.TICKET_TABLE);
    tables.forEach(table => {
        observer.observe(table, {
            childList: true,
            subtree: true,
            attributes: false
        });
    });

    // Počáteční kontrola
    checkForNewTickets(true);
    
    // Interval pro kontrolu
    setInterval(() => {
        if (!isProcessing) {
            handleChanges();
        }
    }, CONFIG.REFRESH_INTERVAL);
}

// Upravený start monitorování
async function startMonitoring() {
    if (isInitialized) {
        log('Monitoring je již inicializován');
        return;
    }
    
    log('Spouštím monitoring');
    
    try {
        const result = await chrome.storage.sync.get(['monitorUrl']);
        monitoredUrl = result.monitorUrl || '';
        log('Načtena monitorovaná URL:', monitoredUrl);

        if (!monitoredUrl) {
            error('Není nastavena URL pro monitoring');
            return;
        }

        if (!shouldMonitorPage()) {
            log('Tato stránka není cílem monitoringu');
            return;
        }

        initializeObserver();

        isInitialized = true;
        log('Monitoring úspěšně inicializován');
        
        // Okamžitá první kontrola
        await refreshListData();
        await checkForNewTickets(true);
    } catch (err) {
        error('Chyba při startu monitoringu:', err);
        isInitialized = false;
    }
}

// Posluchač pro změny nastavení
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.monitorUrl) {
        monitoredUrl = changes.monitorUrl.newValue;
        if (monitoredUrl) {
            startMonitoring();
        }
    }
});

// Cleanup
window.addEventListener('unload', () => {
    if (observer) {
        observer.disconnect();
    }
});

// Spustit monitoring při načtení stránky
startMonitoring(); 