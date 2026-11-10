import { createCheckoutHandler } from "./handler.mjs";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

Deno.serve(createCheckoutHandler({
  getEnv: (name: string) => Deno.env.get(name),
}));
