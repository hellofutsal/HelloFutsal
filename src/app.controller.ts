import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      message: "Server is alive",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
