#include "../Jaffx.hpp"

// AdcReads allow us to sample continuous control values
class AdcRead : public Jaffx::Firmware {
  bool trigger = false;

  void init() override {
    AdcChannelConfig config[3]; // Array of 3 ADC configs
    config[0].InitSingle(seed::A0);
    config[1].InitSingle(seed::A1);
    config[2].InitSingle(seed::A2);
    this->hardware.adc.Init(config, 3);
    this->hardware.adc.Start();
    this->hardware.StartLog();
  }

  void loop() override {
    float x = this->hardware.adc.GetFloat(2) * 3.3;
    float y = this->hardware.adc.GetFloat(1) * 3.3;
    float z = this->hardware.adc.GetFloat(0) * 3.3;

    hardware.PrintLine("X: " FLT_FMT3 ", Y: " FLT_FMT3 ", Z: " FLT_FMT3, 
                       FLT_VAR3(x), FLT_VAR3(y), FLT_VAR3(z));
    System::Delay(500); // Don't spam the serial!
  }

};

int main(void) {
  AdcRead mAdcRead;
  mAdcRead.start();
}


