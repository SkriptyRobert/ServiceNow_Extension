document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url');
  const customSound = document.getElementById('customSound');
  const soundSelect = document.getElementById('soundSelect');
  const customSoundContainer = document.getElementById('customSoundContainer');
  const saveButton = document.getElementById('saveSettings');
  const testButton = document.getElementById('testSound');
  const criticalNotificationsRadios = document.getElementsByName('criticalNotifications');

  // Function to play sound
  async function playSound(soundType, customSoundData = null) {
    try {
      let audio;
      
      if (soundType === 'custom') {
        // Pokud máme přímo data, použijeme je
        if (customSoundData) {
          audio = new Audio(customSoundData);
        } else {
          // Jinak načteme z local storage
          const result = await chrome.storage.local.get(['customSoundData']);
          if (!result.customSoundData) {
            throw new Error('Custom sound not found');
          }
          audio = new Audio(result.customSoundData);
        }
      } else {
        audio = new Audio(chrome.runtime.getURL(`sounds/${soundType}`));
      }
      
      console.log('Playing sound:', soundType);
      audio.volume = 1.0;

      // Přidáme error handler
      audio.onerror = (e) => {
        console.error('Audio error:', e);
        throw new Error('Failed to play sound');
      };
      
      // Přehrajeme zvuk
      try {
        await audio.play();
        return new Promise((resolve) => {
          audio.onended = resolve;
        });
      } catch (error) {
        console.error('Play error:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error playing sound:', error);
      throw error;
    }
  }

  // Load saved settings
  async function loadSettings() {
    try {
      // Načteme základní nastavení
      const settings = await chrome.storage.sync.get(['monitorUrl', 'soundType', 'criticalNotificationsEnabled']);
      
      if (settings.monitorUrl) {
        urlInput.value = settings.monitorUrl;
      }
      
      if (settings.soundType) {
        soundSelect.value = settings.soundType;
        if (settings.soundType === 'custom') {
          customSoundContainer.style.display = 'block';
          
          // Pokud je vybrán custom zvuk, zkontrolujeme, zda existuje v local storage
          const customSound = await chrome.storage.local.get(['customSoundData']);
          if (!customSound.customSoundData) {
            console.warn('Custom sound data not found, reverting to default');
            soundSelect.value = 'default.mp3';
            customSoundContainer.style.display = 'none';
            // Aktualizujeme nastavení v sync storage
            await chrome.storage.sync.set({ soundType: 'default.mp3' });
          }
        }
      } else {
        soundSelect.value = 'default.mp3';
      }
      
      // Nastavení radio buttonů
      const criticalEnabled = settings.criticalNotificationsEnabled !== false;
      criticalNotificationsRadios.forEach(radio => {
        radio.checked = (radio.value === 'enabled') === criticalEnabled;
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Load settings on startup
  loadSettings();

  // Handle sound selection change
  soundSelect.addEventListener('change', (e) => {
    customSoundContainer.style.display = e.target.value === 'custom' ? 'block' : 'none';
    if (e.target.value !== 'custom') {
      // Při změně na jiný než custom zvuk smažeme custom data
      chrome.storage.local.remove(['customSoundData']);
      // Aktualizujeme nastavení v sync storage
      chrome.storage.sync.set({ soundType: e.target.value });
    }
  });

  // Handle test button click
  testButton.addEventListener('click', async () => {
    const soundType = soundSelect.value;
    try {
      if (soundType === 'custom') {
        if (!customSound.files.length) {
          // Nejprve zkusíme přehrát uložený custom zvuk
          await playSound('custom');
        } else {
          const maxSize = 1024 * 1024;
          if (customSound.files[0].size > maxSize) {
            alert('Custom sound file is too large. Maximum size is 1MB.');
            return;
          }

          if (!customSound.files[0].type.startsWith('audio/')) {
            alert('Please select a valid audio file.');
            return;
          }

          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const soundData = e.target.result;
              // Nejprve uložíme zvuk
              await chrome.storage.local.set({ customSoundData: soundData });
              console.log('Custom sound saved successfully');
              // Pak ho přehrajeme pro test
              await playSound('custom', soundData);
            } catch (error) {
              console.error('Error handling custom sound:', error);
              alert('Error handling sound: ' + error.message);
            }
          };
          reader.readAsDataURL(customSound.files[0]);
        }
      } else {
        await playSound(soundType);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
      alert('Error playing sound: ' + error.message);
    }
  });

  // Handle save button click
  saveButton.addEventListener('click', async () => {
    if (!urlInput.value) {
      alert('Please enter monitoring URL');
      return;
    }

    try {
      const selectedSound = soundSelect.value;
      const criticalEnabled = Array.from(criticalNotificationsRadios)
        .find(radio => radio.checked).value === 'enabled';

      // Funkce pro uložení nastavení
      const saveSettings = async () => {
        await chrome.storage.sync.set({
          monitorUrl: urlInput.value,
          soundType: selectedSound,
          criticalNotificationsEnabled: criticalEnabled
        });
        chrome.runtime.sendMessage({ type: 'settingsUpdated' });
        alert('Settings saved successfully');
      };

      if (selectedSound === 'custom') {
        if (customSound.files.length > 0) {
          // Nový soubor byl vybrán
          const maxSize = 1024 * 1024;
          if (customSound.files[0].size > maxSize) {
            alert('Custom sound file is too large. Maximum size is 1MB.');
            return;
          }

          if (!customSound.files[0].type.startsWith('audio/')) {
            alert('Please select a valid audio file.');
            return;
          }

          // Uložíme nový custom zvuk
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const soundData = e.target.result;
              // Uložíme zvuk bez přehrávání
              await chrome.storage.local.set({ customSoundData: soundData });
              await saveSettings();
            } catch (error) {
              console.error('Error saving custom sound:', error);
              alert('Error saving custom sound: ' + error.message);
            }
          };
          reader.readAsDataURL(customSound.files[0]);
        } else {
          // Kontrola, zda existuje uložený custom zvuk
          const existingSound = await chrome.storage.local.get(['customSoundData']);
          if (!existingSound.customSoundData) {
            alert('Please select a custom sound file');
            return;
          }
          await saveSettings();
        }
      } else {
        await chrome.storage.local.remove(['customSoundData']);
        await saveSettings();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings: ' + error.message);
    }
  });

  // Handle messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'playSound') {
      playSound(request.soundType, request.customSoundData)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error playing sound:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  });
}); 