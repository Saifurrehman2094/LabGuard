"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, Download, Sparkles } from "lucide-react";
import NeuralBackground from "./NeuralBackground";

const stats = [
  { value: "5", label: "Flagship AI projects" },
  { value: "10+", label: "Agent & ML frameworks" },
  { value: "60%", label: "Workload automated at Nexium" },
  { value: "2026", label: "BS Computer Science" },
];

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center overflow-hidden pt-28"
    >
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute -left-32 top-10 h-[26rem] w-[26rem] animate-blob-move rounded-full bg-violet/35 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 top-40 h-[26rem] w-[26rem] animate-blob-move rounded-full bg-cyan/25 blur-[120px] [animation-delay:2s]" />
      <div className="pointer-events-none absolute left-1/3 top-64 h-72 w-72 animate-blob-move rounded-full bg-magenta/20 blur-[130px] [animation-delay:4s]" />
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_40%,transparent_100%)]" />

      <NeuralBackground />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1.15fr,0.85fr] lg:px-10">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet/40 bg-violet/10 px-4 py-1.5 font-mono text-xs text-violet-soft"
          >
            <Sparkles size={14} />
            Available for new AI/ML engagements
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-4xl font-semibold leading-[1.1] text-cloud sm:text-5xl lg:text-6xl"
          >
            Building AI systems
            <br />
            that reason, retrieve
            <br />
            <span className="text-gradient">and ship to production.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-mist"
          >
            I&apos;m <span className="text-cloud">Saif ur Rehman</span>, an
            AI Engineer specializing in{" "}
            <span className="text-cloud">
              agentic AI, generative AI, machine learning, cloud solutions,
            </span>{" "}
            and full-stack development — turning autonomous agents and
            LLM-driven workflows into production-grade systems.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <a
              href="#projects"
              className="group inline-flex items-center gap-2 rounded-full bg-violet px-6 py-3 font-mono text-sm font-medium text-ink shadow-glow transition-transform hover:-translate-y-0.5"
            >
              View my work
              <ArrowDownRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5"
              />
            </a>
            <a
              href="/resume/Saif_ur_Rehman_Resume.pdf"
              download
              className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 font-mono text-sm text-cloud transition-colors hover:border-cyan/60 hover:text-cyan"
            >
              <Download size={16} />
              Download resume
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-14 grid max-w-lg grid-cols-2 gap-6 sm:grid-cols-4"
          >
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-display text-2xl font-semibold text-cloud">
                  {s.value}
                </p>
                <p className="mt-1 text-xs leading-snug text-mist">
                  {s.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Floating terminal / code card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="relative hidden lg:block"
        >
          <div className="glow-border animate-float rounded-2xl">
            <div className="glass rounded-2xl p-5 shadow-glow-sm">
              <div className="mb-4 flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#FF5F56]" />
                <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
                <span className="h-3 w-3 rounded-full bg-[#27C93F]" />
                <span className="ml-3 font-mono text-xs text-mist">
                  agent_pipeline.py
                </span>
              </div>
              <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-mist">
<span className="text-violet-soft">class</span> <span className="text-cyan-soft">RAGAgent</span>:{"\n"}
{"    "}<span className="text-violet-soft">def</span> <span className="text-cyan-soft">__init__</span>(self, llm, retriever):{"\n"}
{"        "}self.llm = llm{"\n"}
{"        "}self.retriever = retriever{"\n"}
{"        "}self.memory = []{"\n\n"}
{"    "}<span className="text-violet-soft">def</span> <span className="text-cyan-soft">answer</span>(self, query: str):{"\n"}
{"        "}ctx = self.retriever.search(query, k=6){"\n"}
{"        "}prompt = build_prompt(query, ctx){"\n"}
{"        "}<span className="text-violet-soft">return</span> self.llm.generate(prompt){"\n\n"}
<span className="text-mist/60"># status: deployed · latency 180ms</span>
              </pre>
            </div>
          </div>

          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="glass absolute -bottom-8 -left-8 rounded-xl px-4 py-3 shadow-glow-cyan"
          >
            <p className="font-mono text-xs text-cyan-soft">accuracy</p>
            <p className="font-display text-xl font-semibold text-cloud">
              97.4%
            </p>
          </motion.div>
        </motion.div>
      </div>

      <motion.a
        href="#about"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-mist"
        aria-label="Scroll to about section"
      >
        <div className="flex h-10 w-6 items-start justify-center rounded-full border border-border p-1">
          <span className="h-2 w-1 rounded-full bg-cyan" />
        </div>
      </motion.a>
    </section>
  );
}
