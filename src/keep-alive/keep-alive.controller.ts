import { Controller, Get } from "@nestjs/common";

@Controller("system")
export class KeepAliveController {
  @Get("active")
  active() {
    return {
      message: "I am active",
      timestamp: new Date().toISOString(),
    };
  }
}
