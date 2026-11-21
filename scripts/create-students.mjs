#!/usr/bin/env node
/* Creates the teacher account and student accounts from a CSV.
 * Usage:
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... \
 *   node scripts/create-students.mjs students.csv [teacherPassword]
 *
 * The SERVICE key is used here only, on the owner's machine. It must never
 * be committed or put in any website file. CSV columns: username,password,full_name
 * Student login emails are synthetic: username@STUDENT_EMAIL_DOMAIN (config.js).
 * Passwords are printed nowhere; hand each student their own credentials privately. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const [, , csvPath, teacherPassword] = process.argv;
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
const DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || "students.abulenoor.app";
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !csvPath) {
  console.error("Need SUPABASE_URL, SUPABASE_SERVICE_KEY and a CSV path.");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// Teacher account
if (teacherPassword) {
  const email = "teacher@" + DOMAIN;
  const { data, error } = await sb.auth.admin.createUser({ email, password: teacherPassword, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  const id = data?.user?.id ?? (await sb.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id;
  await sb.from("teachers").upsert({ id });
  console.log("teacher account ready:", email);
}

const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("username"));
for (const line of lines) {
  const [username, password, ...rest] = line.split(",");
  const fullName = rest.join(",").trim();
  const email = username.trim().toLowerCase() + "@" + DOMAIN;
  const { data, error } = await sb.auth.admin.createUser({ email, password: password.trim(), email_confirm: true });
  let id = data?.user?.id;
  if (error) {
    if (!/already/i.test(error.message)) { console.error(username, "FAILED:", error.message); continue; }
    id = (await sb.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id;
  }
  await sb.from("students").upsert({ id, username: username.trim().toLowerCase(), full_name: fullName });
  console.log("ok:", username.trim());
}
console.log("Done.");
