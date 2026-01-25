<p align="center">
<p align="left">
  <img src="simulator-interface/assets/logos/edupace_text_right_crop.png" width="260" alt="EduPace">
</p>
</p>


EduPace is an educational simulator that trains nurses and students to configure a temporary external single-chamber pacemaker. It provides realistic practice in pacing, sensing, and threshold adjustments by replicating the behaviour of the Medtronic 53401 Temporary External Pacemaker. The system combines a software-based ECG and pacing simulator with a physical control unit that includes knobs, LEDs, and a display, allowing users to interact with the device as they would in a clinical setting.

Developed within the TU Delft Minor Biomedical Engineering in collaboration with the Reinier de Graaf Hospital (Delft, Netherlands).

[**EduPace Project Report**](docs/report.pdf)

---

## Installation & Setup
### **Requirements**
- Arduino GIGA R1 WiFi
- Arduino GIGA Display Shield
- Google Chrome / Edge (WebSerial support)
- USB-C cable

### **Setup**
1. Clone this repository  
2. Upload `hardware/EduPace2025.ino` to the GIGA  
3. Open the EduPace UI in your browser or download the installer from Releases.
4. Connect the EduPace device to the computer with a USB cable.  
5. Begin a training scenario

---
## Repository Structure

```text
.
├── .github/                  # GitHub workflows and configuration
├── README.md
├── package.json               # Electron wrapper metadata and scripts
├── package-lock.json
├── cad/                       # Mechanical CAD design files and exports
├── arduino/                   # Firmware and hardware assets
│   ├── README.md
│   ├── digital.c
│   └── EduPace_final/         # LVGL UI, serial logic, and encoder handling
│       ├── *.ino
│       ├── key.c
│       ├── lv_conf.h
│       ├── edupace_logo*.{c,png}
│       └── tu_logo.{c,jpg}
├── electron/                  # Electron wrapper for the simulator
│   ├── about.html
│   ├── icons/
│   ├── main.js
│   └── preload.js
└── simulator-interface/       # ECG simulator & WebApp Interface
    ├── assets/
    ├── data/
    ├── ecg/
    ├── js/
    ├── styles/
    └── index.html
```

___

## Contributors

**Minor BME 2025 Team:** 
Ashley Jacobi, Süheyla Nurlu, Cees Vlasman, Adrien Joon-Ha Im


**Clinical Supervisor:** 
Paul Verschuren, Reinier de Graaf Hospital

---

### Contributions

**Ashley Jacobi**
- Researched physiological ECG morphology and clinical requirements
- Designed ECG generation engine (real-time Bézier-based cycles)
- Developed pacemaker timing system (sensing, inhibition, capture logic)
- Led documentation work and coordinated communication with the hospital and clinical supervisors


**Süheyla Nurlu**
- Implemented Arduino-side functionality (encoders, knobs, buttons, LEDs)
- Developed hardware interaction logic and Serial communication routines
- Managed wiring, pin mapping, and microcontroller integration

**Cees Vlasman**
- Designed enclosure components and mechanical layout (CAD modeling)
- Executed 3D printing, hardware assembly, and fit verification
- Ensured ergonomic alignment of knobs, display, and casing
  
**Adrien Joon-Ha Im**
- Designed and implemented the UI/UX flow, layout system, and visual interface
- Integrated UI components: pacing/sensing indicators, alarms, waveform rendering
- Built WebSerial communication protocol between Arduino and simulator
- Implemented PVC/PAC logic, QRS width modulation, and threshold drift
- Structured the scenario engine and front-end simulator architecture

---
## Limitations & Future Work

- Dual-chamber pacing implementation
- Improvement of morphology
- Expand number of clinical cases

---
## Disclaimer

EduPace is **for educational use only** and **not a medical device**.

---

## License
MIT License
