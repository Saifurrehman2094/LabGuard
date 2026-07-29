"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Cpu, Layers, Rocket } from "lucide-react";
import SectionHeading from "./SectionHeading";

const focusAreas = [
  {
    icon: BrainCircuit,
    title: "Agentic AI",
    desc: "Multi-agent orchestration, tool calling, memory management, and autonomous workflows with LangChain & LangGraph.",
  },
  {
    icon: Layers,
    title: "Generative AI",
    desc: "LLM integration, RAG systems, prompt engineering, fine-tuning, and diffusion-model research.",
  },
  {
    icon: Cpu,
    title: "Cloud Solutions",
    desc: "AWS (Lambda, EC2, Step Functions), Docker, Kubernetes, Terraform, and CI/CD pipelines.",
  },
  {
    icon: Rocket,
    title: "Full-Stack Development",
    desc: "MERN stack, FastAPI, REST & WebSocket APIs, and production-grade backend services.",
  },
];

export default function About() {
  return (
    <section id="about" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading tag="// 01_about" title="Who I am" />

        <div className="grid gap-14 lg:grid-cols-[0.9fr,1.1fr] lg:items-start">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="glow-border rounded-2xl"
          >
            <div className="glass rounded-2xl p-8">
              <p className="font-mono text-xs text-cyan">SAIF UR REHMAN</p>
              <p className="mt-2 font-display text-2xl font-semibold text-cloud">
                AI Engineer
              </p>
              <p className="mt-1 text-sm text-mist">
                Islamabad, Pakistan · Working with teams worldwide
              </p>
              <div className="mt-6 space-y-3 border-t border-border pt-6 font-mono text-sm text-mist">
                <div className="flex justify-between">
                  <span>Focus</span>
                  <span className="text-cloud">Agentic AI · GenAI · Cloud</span>
                </div>
                <div className="flex justify-between">
                  <span>Education</span>
                  <span className="text-cloud">BS Computer Science, FAST-NUCES</span>
                </div>
                <div className="flex justify-between">
                  <span>Experience</span>
                  <span className="text-cloud">SWE Intern @ Nexium</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="flex items-center gap-1.5 text-cloud">
                    <span className="h-2 w-2 animate-pulse-glow rounded-full bg-cyan" />
                    Open to work
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <p className="text-lg leading-relaxed text-mist">
              I&apos;m an AI Engineer with experience designing and building
              autonomous agents and LLM-driven workflows for scalable backend
              services. I&apos;m skilled in prompt chaining, microservices,
              and serverless architectures on AWS, with a strong foundation
              in Node.js, Python, and CI/CD pipelines.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-mist">
              As a Software Engineering Intern at Nexium, I engineered
              backend services and LLM integration workflows, and deployed
              autonomous data-processing pipelines that reduced manual
              workload by 60%. Alongside that, I&apos;ve built multi-agent
              systems, RAG pipelines, and generative-AI research projects —
              and I&apos;m demonstrably able to automate development
              workflows and optimize performance for production AI
              applications.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {focusAreas.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group rounded-xl border border-border bg-surface/60 p-5 transition-all hover:-translate-y-1 hover:border-violet/50 hover:shadow-glow-sm"
                >
                  <f.icon className="text-violet-soft" size={22} />
                  <p className="mt-3 font-display text-base font-semibold text-cloud">
                    {f.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-mist">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
