import { Github, Linkedin, Terminal } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative border-t border-border/70 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 sm:flex-row sm:justify-between lg:px-10">
        <a
          href="#hero"
          className="flex items-center gap-2 font-display text-base font-semibold text-cloud"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet/40 bg-violet/10 text-violet-soft">
            <Terminal size={16} />
          </span>
          Saif<span className="text-gradient">.ai</span>
        </a>

        <p className="font-mono text-xs text-mist">
          © {new Date().getFullYear()} Saif ur Rehman. Built with Next.js &amp; a lot of coffee.
        </p>

        <div className="flex gap-4 text-mist">
          <a
            href="https://github.com/Saifurrehman2094"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="transition-colors hover:text-cyan"
          >
            <Github size={18} />
          </a>
          <a
            href="https://www.linkedin.com/in/saif-ur-rehman001/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="transition-colors hover:text-cyan"
          >
            <Linkedin size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
}
