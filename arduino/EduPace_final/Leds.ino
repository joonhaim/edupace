/*Green led (left) - Blue led (right)*/

void updateLeds() {
  // --- Green LED ---
  if (greenState) {
    lv_obj_set_style_bg_color(left_circle, lv_color_hex(0x00FF00), LV_PART_MAIN); // green visible
    lv_obj_set_style_bg_opa(left_circle, LV_OPA_COVER, LV_PART_MAIN);
  } 
  else {
    lv_obj_set_style_bg_color(left_circle, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(left_circle, LV_OPA_TRANSP, LV_PART_MAIN);
  }

  // --- Blue LED ---
  if (blueState) {
    lv_obj_set_style_bg_color(right_circle, lv_color_hex(0x0000FF), LV_PART_MAIN); // blue visible
    lv_obj_set_style_bg_opa(right_circle, LV_OPA_COVER, LV_PART_MAIN);
  } 
  else {
    lv_obj_set_style_bg_color(right_circle, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(right_circle, LV_OPA_TRANSP, LV_PART_MAIN);
  }
}

void handleSerialSignals() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim(); // remove any whitespace or newline

    if (cmd == "GREEN_ON") greenState = true;        
    else if (cmd == "GREEN_OFF") greenState = false; 
    else if (cmd == "BLUE_ON") blueState = true;     
    else if (cmd == "BLUE_OFF") blueState = false;   

    updateLeds(); // refresh LED display
  }
}



