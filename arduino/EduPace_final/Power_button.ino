/*Power Button

Output format: POWER_ON / POWER_OFF */

void turnPowerOn() {
  power_pressed = true;

  key_pressed = false;
  autoLocked = false;
  lastChangeTime = millis();

  paceIndex = 19;
  outputIndex = 19;
  senseIndex = 5;

  pace = 80;
  output = 10;
  sense = 2.0;

  ALastState1 = digitalRead(inputA1);
  ALastState2 = digitalRead(inputA2);
  ALastState3 = digitalRead(inputA3);

  lastPace = NAN;
  lastOutput = NAN;
  lastSense = NAN;

  lv_label_set_text(top_number, "80");
  lv_label_set_text(middle_number, "10.0");
  lv_label_set_text(bottom_number, "2.0");

  lv_obj_set_style_bg_color(cont, lv_color_white(), LV_PART_MAIN);

  lv_obj_set_style_border_color(power_btn, lv_color_hex(0x00FF00), LV_PART_MAIN);
  lv_obj_set_style_text_color(lv_obj_get_child(power_btn,0), lv_color_hex(0x00FF00), LV_PART_MAIN);

  Serial.println("POWER_ON");
  Serial.println("LOCK_OFF");
}

void turnPowerOff() {
  power_pressed = false;

  lv_obj_set_style_bg_color(cont, lv_color_hex(0x808080), LV_PART_MAIN);
  lv_obj_set_style_border_color(power_btn, lv_color_white(), LV_PART_MAIN);
  lv_obj_set_style_text_color(lv_obj_get_child(power_btn,0), lv_color_white(), LV_PART_MAIN);

  lv_label_set_text(top_number, "--");
  lv_label_set_text(middle_number, "--");
  lv_label_set_text(bottom_number, "--");

  Serial.println("POWER_OFF");
  Serial.println("LOCK_OFF");
}

static bool pressed_flag = false;  
/*Power Button Fix: First press didn’t work because LVGL could send a RELEASED event 
before PRESSED is registered. The flag ensures RELEASE is only handled 
after a valid PRESSED event, making long-press detection reliable.*/

static void power_button_event_cb(lv_event_t * e) {
  lv_event_code_t code = lv_event_get_code(e);
  lv_obj_t * btn = (lv_obj_t *) lv_event_get_target(e);

  if (key_pressed) return;  // Power can't go off when the system is locked 

  if (code == LV_EVENT_PRESSED) {
    powerBtnPressTime = millis(); 
    pressed_flag = true;   // mark that a press has occurred
    return;
  }

  if (code == LV_EVENT_RELEASED) {
    unsigned long heldTime = millis() - powerBtnPressTime;
    pressed_flag = false;       // reset flag

    //LONG PRESS POWER ON -> OFF 
    if (heldTime >= powerHoldDuration) { //Long press -> toggle
      if (power_pressed) turnPowerOff();
    } 
    //SHORT PRESS POWER OFF -> ON
    else{
      if (!power_pressed) turnPowerOn();
    }  
  }
}
