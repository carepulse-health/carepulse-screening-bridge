import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<typeof Input>, "type"> & { label: string };

/** Password field with a show/hide eye toggle. Hidden by default. */
export function PasswordInput({ label, className, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} className={`pr-11 ${className ?? ""}`} />
    <button type="button" onClick={() => setVisible(v => !v)}
      aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground">
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>;
}
