# EduPace Hardware 

## Hardware Requirements 
 - Arduino Giga R1
 - Giga Display Shield (480×800)
 - 3 Incremental Rotary Encoders (for Pace, Output, and Sense)

## Software Requirements

- Arduino IDE 
- LVGL graphics library (9.4.0)
- Arduino_H7_Video library
- Arduino_GigaDisplayTouch library
- Download digital.c file and add it inside the font folder of Arduino "C:\..\..\..\Arduino\libraries\lvgl\src\font\digital.c"

## Features

- Touch-enabled lock button
- Real-time display of Pace, Output, and Sense parameters
- Rotary encoder input for adjusting values
- LED indicators for status feedback
- Serial communication for external monitoring/control
- Graphical dials and digital readouts for parameter visualization
- Flickering LED effect to simulate device activity

## Serial Communication

- Baud rate: 115200
- Input Commands: GREEN_ON / GREEN_OFF / BLUE_ON / BLUE_OFF
- Output Format: PACE=80.00,OUTPUT=10.00,SENSE=2.00

## Pin Connections
| Component    | Signal   | Arduino Pin | Notes                 |
|-------------|---------|------------|----------------------|
| ENCODER 1   | CLK (A) | 2          | Pace rotary encoder   |
| ENCODER 1   | DT (B)  | 3          | Pace rotary encoder   |
| ENCODER 2   | CLK (A) | 6          | Output rotary encoder |
| ENCODER 2   | DT (B)  | 7          | Output rotary encoder |
| ENCODER 3   | CLK (A) | 12         | Sense rotary encoder  |
| ENCODER 3   | DT (B)  | 13         | Sense rotary encoder  |
| Power       | +5V     | +5V        | Supply voltage        |
| Ground      | GND     | GND        | Common ground         |
  
