"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const steps = [
  {
    step: "01",
    title: "Frame the problem",
    desc: "Define the decision the model needs to support and the metric that proves it's working.",
  },
  {
    step: "02",
    title: "Data & baselines",
    desc: "Audit data quality, ship a simple baseline first, and set an honest evaluation harness.",
  },
  {
    step: "03",
    title: "Model & iterate",
    desc: "Train, fine-tune, or orchestrate the right architecture — then iterate against real errors.",
  },
  {
    step: "04",
    title: "Ship & monitor",
    desc: "Deploy behind clean APIs with logging, drift detection, and a rollback plan from day one.",
  },
];

export default function Process() {
  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          tag="// 06_process"
          title="How I work"
          description="A repeatable process for taking a model from idea to something a business can trust."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-2xl border border-border bg-surface/60 p-6"
            >
              <span className="font-display text-4xl font-semibold text-border">
                {s.step}
              </span>
              <p className="mt-3 font-display text-lg font-semibold text-cloud">
                {s.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                {s.desc}
              </p>
              {i < steps.length - 1 && (
                <span className="absolute right-[-14px] top-1/2 hidden h-px w-7 -translate-y-1/2 bg-border lg:block" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
