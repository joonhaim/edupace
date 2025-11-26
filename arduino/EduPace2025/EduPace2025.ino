/* EduPace 2025 

Arduino Giga R1 + display shield 
Baud rate: 115200 

Input Format: GREEN_ON / GREEN_OFF / BLUE_ON / BLUE_OFF
Output Format: PACE=80.00,OUTPUT=10.00,SENSE=2.00 */

#include "lvgl.h" //graphics library for buttons etc.
#include "Arduino_H7_Video.h"  //controls GIGA display
#include "Arduino_GigaDisplayTouch.h" //reads touch input
#include "lv_conf.h" 
#include <math.h> // needed for isnan()

LV_IMG_DECLARE(key);
LV_FONT_DECLARE(digital)

Arduino_H7_Video          Display(480, 800, GigaDisplayShield); /* Arduino_H7_Video Display(1024, 768, USBCVideo); */
Arduino_GigaDisplayTouch  TouchDetector;

//Lock button 
unsigned long lastChangeTime = 0; // time of last pace/output/sense change
const unsigned long autoLockInterval = 60000; // 60 seconds in milliseconds

bool key_pressed = false; 
bool autoLocked = false;

//Led States
bool greenState = true;  // current state of green LED
bool blueState  = false;  // current state of blue LED

unsigned long lastFlickerTime = 0;
bool flickerOn = false;    // current flicker state (on/off)
const int flickerInterval = 300; // ms between flicker states

//Encoder values (Default values: Pace 80, output 10, sensen 2.0)
float pace = 80;
float output = 10;
float sense = 2.0;

// For serial transmission of updated values
float lastPace = -1;
float lastOutput = -1;
float lastSense = -1;

//Indexes 
int paceIndex = 19;
int outputIndex = 19;
int senseIndex = 5;

//Steps for lookup tables 
const int paceSteps = 50;
const int outputSteps = 35;
const int senseSteps = 21;

lv_obj_t * cont;   //main container

void setup() {
  Serial.begin(115200);
  
  lv_init();
  Display.begin();
  TouchDetector.begin();
  
  setupDisplay();
  setupDial();
  setupEncoders(); 

  updateLeds();
}

void loop() {
  updateEncoders();            
  updateDisplayLabels();
  updateDial();
  sendUpdatedValues();

  handleSerialSignals();
  updateLeds();

  checkAutoLock();

  lv_timer_handler();  
  delay(5);
}

