# EduPace — External Temporary Pacemaker Training Simulator

**EduPace** is an educational simulator that trains nurses and students to configure a temporary external single-chamber pacemaker. It allows users to practice pacing, sensing, and threshold adjustments.
Developed within the TU Delft Minor Biomedical Engineering in collaboration with the Reinier de Graaf Hospital (Delft, Netherlands).

---

## 🔧 Overview

EduPace replicates the behavior of the **Medtronic 53401 Temporary External Pacemaker** using:

- A software-based ECG simulator  
- A physical control unit with knobs, LEDs, and display  

---

## 🧩 System Overview

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
