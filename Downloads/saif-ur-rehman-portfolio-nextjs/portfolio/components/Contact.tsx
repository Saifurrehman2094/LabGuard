"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Github, Linkedin, Loader2, Mail, MapPin, Send } from "lucide-react";
import SectionHeading from "./SectionHeading";

type Status = "idle" | "loading" | "success" | "error";

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({ name: "", email: "", message: "", company: "" });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data?.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setForm({ name: "", email: "", message: "", company: "" });
    } catch {
      setStatus("error");
      setErrorMsg("Network error — please check your connection and try again.");
    }
  }

  return (
    <section id="contact" className="relative py-28">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-violet/20 blur-[130px]" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          tag="// 08_contact"
          title="Let's build something intelligent"
          description="Have a project, a role, or just a hard ML problem you want a second opinion on? My inbox is open."
          align="center"
        />

        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr,1.2fr]">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-border bg-surface/60 p-6">
              <Mail className="text-cyan-soft" size={20} />
              <p className="mt-3 font-mono text-xs text-mist">Email</p>
              <p className="font-display text-sm font-medium text-cloud">
                saif.shafqat92@gmail.com
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface/60 p-6">
              <MapPin className="text-cyan-soft" size={20} />
              <p className="mt-3 font-mono text-xs text-mist">Location</p>
              <p className="font-display text-sm font-medium text-cloud">
                Islamabad, Pakistan (Remote-friendly)
              </p>
            </div>
            <div className="flex gap-3 rounded-2xl border border-border bg-surface/60 p-6">
              <a
                href="https://github.com/Saifurrehman2094"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-mist transition-colors hover:border-cyan/60 hover:text-cyan"
              >
                <Github size={18} />
              </a>
              <a
                href="https://www.linkedin.com/in/saif-ur-rehman001/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-mist transition-colors hover:border-cyan/60 hover:text-cyan"
              >
                <Linkedin size={18} />
              </a>
            </div>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glow-border rounded-2xl"
          >
            <div className="glass space-y-4 rounded-2xl p-7">
              {/* Honeypot field — hidden from real users, bots often fill it in */}
              <input
                type="text"
                name="company"
                value={form.company}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                aria-hidden="true"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-mono text-xs text-mist">
                    Name
                  </label>
                  <input
                    required
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    disabled={status === "loading"}
                    className="w-full rounded-lg border border-border bg-ink/60 px-4 py-2.5 text-sm text-cloud placeholder:text-mist/50 focus:border-violet/60 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs text-mist">
                    Email
                  </label>
                  <input
                    required
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                    disabled={status === "loading"}
                    className="w-full rounded-lg border border-border bg-ink/60 px-4 py-2.5 text-sm text-cloud placeholder:text-mist/50 focus:border-violet/60 disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-xs text-mist">
                  Message
                </label>
                <textarea
                  required
                  rows={4}
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell me about your project or role..."
                  disabled={status === "loading"}
                  className="w-full resize-none rounded-lg border border-border bg-ink/60 px-4 py-2.5 text-sm text-cloud placeholder:text-mist/50 focus:border-violet/60 disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-violet px-6 py-3 font-mono text-sm font-medium text-ink shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send message
                  </>
                )}
              </button>

              {status === "success" && (
                <p className="text-center font-mono text-xs text-cyan-soft">
                  Message sent — I&apos;ll reply within 1–2 business days.
                </p>
              )}
              {status === "error" && (
                <p className="text-center font-mono text-xs text-magenta-soft">
                  {errorMsg}
                </p>
              )}
            </div>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
