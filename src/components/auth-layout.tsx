import { Brand } from "./shell";
import { PetArt } from "./pet-art";

export function AuthLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="auth-layout">
    <div className="auth-story"><Brand /><div><div className="w-72 mx-auto"><PetArt /></div><h2 className="text-4xl tracking-tight leading-tight mt-5">Their whole world.<br />In one thoughtful place.</h2><p className="text-muted-foreground leading-7 mt-5 max-w-sm">Less time keeping track. More time for belly rubs, long walks, and all the little moments together.</p></div><span className="eyebrow">A LITTLE CARE. A HEALTHIER LIFE.</span></div>
    <div className="auth-form"><div className="auth-form-inner"><div className="mb-10 lg:hidden"><Brand /></div><span className="eyebrow">WELCOME TO PAWTRACK</span><h1 className="text-3xl tracking-tight mt-4 mb-3">{title}</h1><p className="text-muted-foreground text-sm leading-6 mb-8">{description}</p>{children}</div></div>
  </div>;
}
