"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const timeline = [
  {
    role: "Software Engineering Intern",
    company: "Nexium · Lahore, Pakistan",
    period: "Jun 2025 — Aug 2025",
    points: [
      "Engineered scalable backend services and RESTful APIs for AI-enabled applications, implementing prompt chaining and LLM integration workflows.",
      "Developed and deployed autonomous data-processing workflows using n8n and serverless architecture on AWS, reducing manual workload by 60%.",
      "Built event-driven MERN stack microservices with Node.js and React integrations that used LLM APIs for intelligent decision-making.",
      "Optimized API response times by 40% through efficient asynchronous programming, query optimization, and CI/CD via GitHub Actions.",
    ],
  },
  {
    role: "Teaching Assistant — Operating Systems",
    company: "FAST National University",
    period: "2024 — 2025",
    points: [
      "Mentored 100+ students in system-level programming and operating systems concepts.",
    ],
  },
  {
    role: "BS, Computer Science",
    company: "FAST National University of Computer & Emerging Sciences · Islamabad",
    period: "Aug 2022 — Jun 2026",
    points: [
      "Coursework: Artificial Intelligence, Machine Learning, Natural Language Processing, Data Structures, Database Systems, Cloud Computing, Distributed Systems.",
    ],
  },
];

export default function Experience() {
  return (
    <section id="experience" className="relative py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-10">
        <SectionHeading
          tag="// 03_experience"
          title="Where I've worked"
          description="A timeline of roles that shaped how I build and ship machine learning systems."
        />

        <div className="relative border-l border-border pl-8">
          {timeline.map((item, i) => (
            <motion.div
              key={item.role}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative pb-14 last:pb-0"
            >
              <span className="absolute -left-[41px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-violet/60 bg-ink shadow-glow-sm">
                <span className="h-2 w-2 rounded-full bg-violet" />
              </span>

              <p className="font-mono text-xs text-cyan-soft">{item.period}</p>
              <h3 className="mt-1.5 font-display text-xl font-semibold text-cloud">
                {item.role}
              </h3>
              <p className="text-sm text-mist">{item.company}</p>

              <ul className="mt-4 space-y-2">
                {item.points.map((p) => (
                  <li
                    key={p}
                    className="flex gap-2.5 text-sm leading-relaxed text-mist"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-mist/60" />
                    {p}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
