# EduPace — External Temporary Pacemaker Training Simulator

EduPace is an educational simulator that trains nurses and students to configure a temporary external single-chamber pacemaker. It allows users to practice pacing, sensing, and threshold adjustments.
Developed within the TU Delft Minor Biomedical Engineering in collaboration with the Reinier de Graaf Hospital (Delft, Netherlands). 

---

## Overview

EduPace was developed to replicate the behavior of the Medtronic 53401 Temporary External Pacemaker using:
- A software-based ECG simulator  
- A physical control unit with knobs, LEDs, and display  

| Component | Function |
|------------|-----------|
| **Hardware** | Arduino GIGA R1 WiFi + Display Shield |
| **Software** | Real-time ECG and pacemaker interaction (TBD) |

---

## Installation & Setup
### **Requirements**
- Arduino **GIGA R1 WiFi**
- Arduino **GIGA Display Shield**
- Google Chrome / Edge (WebSerial support)
- USB-C cable

### **Setup**
1. Clone this repository  
2. Upload `hardware/EduPace2025.ino` to the GIGA  
3. Open the EduPace UI in your browser  
4. Connect via WebSerial  
5. Begin a training scenario  

---
## Repository Structure

```text
edupace/
│
├── arduino/                    # Arduino firmware and hardware logic
│   ├── Dial.ino
│   ├── Display.ino
│   ├── EduPace2025.ino
│   ├── Key_Button.ino
│   ├── Leds.ino
│   ├── Serial_communication.ino
│   ├── digital.c
│   ├── key.c
│   ├── l_conf.h
│   └── README.md
│
├── docs/                       # Documentation, figures, reports
│
├── simulator-interface/        # Browser-based pacing & ECG simulator
│   ├── assets/
│   │   ├── audio/
│   │   ├── icons/
│   │   └── logos/
│   ├── data/
│   │   └── scenarios.json
│   ├── ecg/
│   │   ├── ecg_core.py
│   │   ├── ecgCore.js
│   │   ├── ecgCore_old.js
│   │   ├── ECG simulation.ipynb
│   │   └── ECG simulation - organised version.ipynb
│   ├── js/
│   ├── partials/
│   ├── styles/
│   ├── index.html
│   └── simulation.html
│
└── misc/                       # Logs, prototypes, temporary assets
    ├── logs.html
    └── ...
```

___

## 👥 Contributors

- **Minor BME 2025 Team:** Ashley Jacobi, Süheyla Nurlu, Adrien Joon-Ha Im, Cees Vlasman  
- **Reinier de Graaf Hospital:** Paul Verschuren (Clinical Supervisor)

---

## ⚠️ Disclaimer

EduPace is **for educational use only** and **not a medical device**.

---

## License
TBD
