# ServiceNow Queue Monitor

Chrome extension for monitoring ServiceNow ticket queue with sound notifications.

## Copyright (C) 2025 BertSoftwares Detailed license see below of this file.

Developed by BertSoftwares  
Contact: robert.pesout@gmail.com  
GitHub: [https://github.com/SkriptyRobert](https://github.com/SkriptyRobert)

© 2025 BertSoftwares. All rights reserved. 

> _This extension is an independent project and is not affiliated with or endorsed by ServiceNow._

## Features

- Real-time monitoring of ServiceNow ticket queue
- Sound alerts for new tickets
- Visual notifications with new ticket details
- Configurable check interval (currently 10 seconds)
- Customizable notification sounds (default, bell, notification, or custom sound)
- Ticket counter in the extension icon
- Critical ticket notifications with persistent display
- Custom sound support with extended playback duration
- Radio button controls for critical notifications
- Web notifications for critical tickets on all ServiceNow tabs

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/` (or `edge://extensions/` for Edge)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Click the extension icon in Chrome
2. Enter the ServiceNow queue URL to monitor
3. Select your preferred notification sound:
   - Default sound
   - Bell sound
   - Notification sound
   - Custom sound (supports MP3 files up to 1MB)
4. Configure critical ticket notifications:
   - Enable/disable using radio buttons
   - When enabled, critical tickets show persistent web notifications
5. Test your sound settings using the "Test Sound" button
6. Click "Save settings"

The extension will automatically start monitoring the specified URL and:
- Display a counter of current tickets
- Play sounds for new tickets
- Show system notifications for all tickets
- Display web notifications for critical tickets (if enabled)

## Project Structure

```
├── manifest.json       # Extension manifest file
├── background.js       # Background script for monitoring
├── content.js          # Content script for page interaction
├── popup.html          # HTML for popup window
├── popup.js            # JavaScript for popup
├── audio.html          # HTML for sound playback
├── audio.js            # JavaScript for sound playback
├── icons/              # Icons folder
│   ├── icon16.png
│   ├── icon32.png
│   └── icon192.png
└── sounds/             # Sounds folder
    ├── default.mp3       # Push your own sound here but keep the name of the file .mp3
    ├── bell.mp3          # Push your own sound here but keep the name of the file .mp3
    └── notification.mp3  # Push your own sound here but keep the name of the file .mp3
```

## Requirements

- Google Chrome version 88 or newer
- Access to ServiceNow instance

## Permissions

The extension requires the following permissions:
- `storage`: For saving settings
- `notifications`: For displaying notifications
- `alarms`: For periodic checks
- `tabs`: For sound playback and web notifications
- `activeTab`: For web notification display
- `scripting`: For content script injection
- Access to `*.service-now.com` domain

## Notes

- The extension monitors only the active ticket queue
- Sound notifications require one-time browser interaction after installation
- Only MP3 files are supported for custom sounds
- Web notifications appear on all ServiceNow tabs
- Critical notifications remain visible until manually closed

## 📄 Copyright & License

**Developed by:** BertSoftwares  
**Author:** Robert Pesout  
**Contact:** [robert.pesout@gmail.com](mailto:robert.pesout@gmail.com)  
**GitHub:** [ServiceNow Extension](https://github.com/SkriptyRobert/ServiceNow_Extension)  
**© 2025 Robert Pesout (BertSoftwares)**

---

### 📋 License Terms

This program is licensed under a **custom license** exclusively for **TietoEvry**. Redistribution, modification, or use by other parties is **not permitted** without explicit permission from **Robert Pesout (BertSoftwares)**.

- ✅ **Free to use** internally by **TietoEvry**.
- ❌ **No redistribution or modification** by third parties without permission.
- ⚠️ **No warranty**—provided *"as is"* without any guarantees of **merchantability** or **fitness for a particular purpose**.

For licensing inquiries or special permissions, please contact: **[robert.pesout@gmail.com](mailto:robert.pesout@gmail.com)**

---

⚖️ *I reserve the right to make changes, updates, or modifications to this program and its licensing terms at any time without prior notice.*

---

## Version 1.1 Updates and Fixes

### New Features
1. **Enhanced Custom Sound Handling**
   - Increased custom sound playback limit to 15 seconds
   - Improved custom sound storage and playback reliability
   - Separated save and test functionality for better user control

2. **Critical Notification Improvements**
   - Added radio button controls for enabling/disabling critical notifications
   - Implemented persistent web notifications for critical tickets
   - Enhanced notification visibility across all ServiceNow tabs

3. **Audio System Enhancements**
   - Improved audio initialization and error handling
   - Added retry functionality for audio system initialization
   - Better sound playback control with precise duration limits

### Bug Fixes
1. **Custom Sound Issues**
   - Fixed custom sound not playing after save
   - Resolved issues with custom sound storage
   - Improved error handling for invalid audio files

2. **Notification System**
   - Fixed web notifications not showing on all tabs
   - Improved notification display reliability
   - Added better error handling for notification failures

3. **General Improvements**
   - Enhanced error messaging and user feedback
   - Improved settings persistence
   - Better handling of browser tab management
   - Added detailed logging for troubleshooting

### Technical Updates
1. **Code Structure**
   - Separated audio handling logic
   - Improved message passing between components
   - Better organization of settings management

2. **Performance**
   - Optimized sound playback mechanism
   - Improved tab management efficiency
   - Better resource handling for notifications 
