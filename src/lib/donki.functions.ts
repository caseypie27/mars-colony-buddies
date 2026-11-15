import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDonki } from "./donki.server";

// Public read-only NASA data. Input cannot override the upstream host or supply a key.
export const getDonki = createServerFn({ method: "GET" })
  .inputValidator(z.object({ type: z.enum(["CME", "FLR", "SEP"]), days: z.union([z.literal(7), z.literal(30)]) }))
  .handler(async ({ data }) => fetchDonki(data.type, data.days, process.env["NASA_API"]));