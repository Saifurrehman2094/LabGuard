const stack = [
  "LangChain",
  "LangGraph",
  "CrewAI",
  "PyTorch",
  "Hugging Face",
  "OpenAI API",
  "Vector DBs",
  "FastAPI",
  "Node.js",
  "React",
  "Docker",
  "Kubernetes",
  "Terraform",
  "AWS",
  "n8n",
];

export default function TechMarquee() {
  const items = [...stack, ...stack];
  return (
    <div className="relative border-y border-border/60 bg-surface/40 py-6">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink to-transparent" />
      <div className="flex w-max animate-marquee gap-10">
        {items.map((t, i) => (
          <span
            key={i}
            className="flex items-center gap-2 font-mono text-sm text-mist"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-violet" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
