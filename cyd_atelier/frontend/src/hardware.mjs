// Native controller dimensions, before ESPHome display rotation.
export const HARDWARE_MODELS = {
  ILI9341:{label:'2,8″ · ESP32-2432S028R · ILI9341',short:'CYD 2,8″',width:240,height:320,backlight:21,dataRate:40},
  ILI9342:{label:'2,8″ · ILI9342-Variante',short:'CYD 2,8″',width:320,height:240,backlight:21,dataRate:40},
  ST7796:{label:'3,5″ · ESP32-3248S035R · ST7796',short:'CYD 3,5″',width:320,height:480,backlight:27,dataRate:20}
};
export const hardwareSpec=model=>HARDWARE_MODELS[model]||HARDWARE_MODELS.ILI9341;
export const nativeDimensions=model=>({width:hardwareSpec(model).width,height:hardwareSpec(model).height});
export const displayDimensions=(model,orientation)=>{
  const spec=hardwareSpec(model),short=Math.min(spec.width,spec.height),long=Math.max(spec.width,spec.height);
  return orientation==='portrait'?{width:short,height:long}:{width:long,height:short};
};
export const displayRotation=(model,orientation,flip=false)=>{
  const spec=hardwareSpec(model),nativeLandscape=spec.width>spec.height;
  return ((nativeLandscape===(orientation==='landscape')?0:90)+(flip?180:0))%360;
};
