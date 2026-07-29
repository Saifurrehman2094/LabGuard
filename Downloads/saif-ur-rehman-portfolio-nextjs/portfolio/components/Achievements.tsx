"use client";

import { motion } from "framer-motion";
import { Award, BadgeCheck, BookOpen, Trophy } from "lucide-react";
import SectionHeading from "./SectionHeading";

const achievements = [
  {
    icon: Trophy,
    title: "Teaching Assistant — Operating Systems",
    org: "FAST National University",
    desc: "Mentored 100+ students in system-level programming and operating systems concepts.",
  },
  {
    icon: BadgeCheck,
    title: "AWS Cloud Foundations",
    org: "AWS Academy",
    desc: "Certified in cloud infrastructure fundamentals and serverless computing on AWS.",
  },
  {
    icon: BookOpen,
    title: "MERN Stack Certification",
    org: "freeCodeCamp",
    desc: "Certified in full-stack web development using MongoDB, Express, React, and Node.js.",
  },
  {
    icon: Award,
    title: "60% Workload Automation at Nexium",
    org: "Software Engineering Internship, 2025",
    desc: "Deployed autonomous data-processing workflows using n8n and serverless AWS architecture, cutting manual workload by 60%.",
  },
];

export default function Achievements() {
  return (
    <section id="achievements" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          tag="// 05_achievements"
          title="Recognition & credentials"
          description="Milestones, certifications, and publications along the way."
        />

        <div className="grid gap-5 sm:grid-cols-2">
          {achievements.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex gap-4 rounded-2xl border border-border bg-surface/60 p-6 transition-colors hover:border-violet/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet/40 bg-violet/10 text-violet-soft">
                <a.icon size={20} />
              </span>
              <div>
                <p className="font-display text-base font-semibold text-cloud">
                  {a.title}
                </p>
                <p className="mt-0.5 font-mono text-xs text-cyan-soft">
                  {a.org}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-mist">
                  {a.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
