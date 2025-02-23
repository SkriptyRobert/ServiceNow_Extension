// AudioContext
let audioContext = null;
let audioBuffer = null;
let isInitialized = false;

// Funkce pro inicializaci AudioContext
async function initializeAudio() {
    if (!isInitialized) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            isInitialized = true;
            console.log('Audio.js: AudioContext initialized');
        } catch (error) {
            console.error('Audio.js: Failed to initialize AudioContext:', error);
            throw error;
        }
    }
}

// Funkce pro načtení zvukového souboru
async function loadSound(url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error('Audio.js: Failed to load sound:', error);
        throw error;
    }
}

// Funkce pro přehrání zvuku
async function playSound(soundType, customSoundData = null) {
    try {
        await initializeAudio();
        
        let soundUrl;
        if (soundType === 'custom' && customSoundData) {
            soundUrl = customSoundData;
        } else {
            soundUrl = chrome.runtime.getURL(`sounds/${soundType}`);
        }
        
        console.log('Audio.js: Loading sound from:', soundUrl);
        
        // Načteme zvuk
        audioBuffer = await loadSound(soundUrl);
        
        // Vytvoříme source node
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Nastavíme hlasitost
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        
        // Propojíme nodes
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Přehrajeme zvuk
        source.start(0);
        
        return new Promise((resolve) => {
            source.onended = resolve;
        });
    } catch (error) {
        console.error('Audio.js: Error playing sound:', error);
        throw error;
    }
}

// zprávy
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'playSound') {
        console.log('Audio.js: Received playSound request:', request.soundType);
        
        // Inicializujeme AudioContext při prvním požadavku
        playSound(request.soundType, request.customSoundData)
            .then(() => {
                console.log('Audio.js: Sound played successfully');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('Audio.js: Error playing sound:', error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true; // Indikuje asynchronní odpověď
    }
}); 
