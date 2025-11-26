/*Key Button*/

static void key_button_event_cb(lv_event_t * e) {
  lv_obj_t * btn = (lv_obj_t *)lv_event_get_target(e);
  lv_obj_t * label = lv_obj_get_child(btn, 0);

  // Toggle state
  autoLocked = false; // reset auto-lock when user presses button
  lastChangeTime = millis(); 
  key_pressed = !key_pressed;

  if(key_pressed) {
    // Pressed state: dark blue fill, yellow border, and key text
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_border_color(btn, lv_color_hex(0xFFEF46), LV_PART_MAIN);
    lv_obj_set_style_text_color(label, lv_color_hex(0xFFEF46), LV_PART_MAIN);
    lv_obj_set_style_bg_color(cont, lv_color_hex(0xB0CECD), LV_PART_MAIN); // gray
  } 
  else {
    // Normal state: dark blue fill, white border, white key
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_border_color(btn, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_bg_color(cont, lv_color_white(), LV_PART_MAIN); // gray
  }
}

void checkAutoLock() {
  if (!key_pressed && !autoLocked && (millis() - lastChangeTime > autoLockInterval)) {
    autoLocked = true;
    key_pressed = true;

    // Use the existing lock button (already created in setupDisplay
    lv_obj_t * label = lv_obj_get_child(key_btn, 0);

    // Apply the same pressed styles from key_button_event_cb
    lv_obj_set_style_bg_color(key_btn, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_border_color(key_btn, lv_color_hex(0xFFEF46), LV_PART_MAIN);
    lv_obj_set_style_text_color(label, lv_color_hex(0xFFEF46), LV_PART_MAIN);
    lv_obj_set_style_bg_color(cont, lv_color_hex(0xB0CECD), LV_PART_MAIN);
  }
}