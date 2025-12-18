/*Splash Screen*/

void start_button_event_cb(lv_event_t * e) {
  if (appStarted) return;
  appStarted = true;

  lastChangeTime = millis(); //reset lock timer

  setupDisplay();  
  setupDial();
  setupEncoders();

  //animate to the main screen (safe: UI already created on main_scr)
  lv_scr_load_anim(main_scr, LV_SCR_LOAD_ANIM_NONE, 300, 0, false); //or LV_SCR_LOAD_ANIM_FADE_ON
}

void showSplashScreen() {

  splash_scr = lv_obj_create(NULL);     // create splash screen
  main_scr   = lv_obj_create(NULL);     // create main screen (empty for now)

  lv_scr_load(splash_scr);              // show splash
  lv_obj_set_style_bg_color(splash_scr, lv_color_hex(0xFFFFFF), LV_PART_MAIN);

  /* Background */
  lv_obj_t * scr = splash_scr;                
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x111551), LV_PART_MAIN);  

  /* Main container */
  lv_obj_t * splash_cont = lv_obj_create(scr);
  lv_obj_set_size(splash_cont, 450, 770);     
  lv_obj_set_style_bg_color(splash_cont, lv_color_hex(0xFFFFFF), LV_PART_MAIN); 
  lv_obj_center(splash_cont);                
  lv_obj_set_style_radius(splash_cont, 20, LV_PART_MAIN);   
  lv_obj_set_style_pad_all(splash_cont, 0, LV_PART_MAIN);

  // TU Delft logo
  lv_obj_t * tu_img = lv_img_create(splash_cont);
  lv_img_set_src(tu_img, &tu_logo_img);
  lv_obj_align(tu_img, LV_ALIGN_CENTER, 0, 250);

  // EduPace logo
  lv_obj_t * edup_img = lv_img_create(splash_cont);
  lv_img_set_src(edup_img, &edupace_logo_img);
  lv_obj_align(edup_img, LV_ALIGN_CENTER, 0, -280);

  //intro text
  lv_obj_t * intro_text = lv_label_create(splash_cont);
  lv_label_set_text(intro_text, "EduPace is an educational tool for external pacemaker training"); 
  lv_obj_set_style_text_color(intro_text, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(intro_text, &lv_font_montserrat_24, LV_PART_MAIN);
  lv_label_set_long_mode(intro_text, LV_LABEL_LONG_WRAP); // enable wrapping
  lv_obj_set_width(intro_text, 400); // max width (less than container width)
  lv_obj_align(intro_text, LV_ALIGN_CENTER, 10, -150);

  //all rights reserved
  lv_obj_t * rights_text = lv_label_create(splash_cont);
  lv_label_set_text(rights_text, "All rights reserved"); 
  lv_obj_set_style_text_color(rights_text, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_text_font(rights_text, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_align(rights_text, LV_ALIGN_CENTER, 0, 350);

  // Start button
  start_btn = lv_btn_create(splash_cont);
  lv_obj_set_size(start_btn, 250, 100);
  lv_obj_align(start_btn, LV_ALIGN_CENTER, 0, 20);
  lv_obj_set_style_bg_color(start_btn, lv_color_hex(0x111551), LV_PART_MAIN); 
  lv_obj_set_style_border_color(start_btn, lv_color_white(), LV_PART_MAIN);
  lv_obj_set_style_border_width(start_btn, 6, LV_PART_MAIN); 
  lv_obj_set_style_radius(start_btn, 20, LV_PART_MAIN); 

  lv_obj_t * lbl = lv_label_create(start_btn);
  lv_label_set_text(lbl, "START");
  lv_obj_set_style_text_font(lbl, &lv_font_montserrat_36, LV_PART_MAIN);
  lv_obj_center(lbl);

  lv_obj_add_event_cb(start_btn, start_button_event_cb, LV_EVENT_CLICKED, NULL);
}