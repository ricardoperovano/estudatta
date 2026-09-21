/**
 * Menu de perfil: avatar com a inicial, nome e e-mail, atalhos de conta e "Sair" sempre à mão.
 * Aparece na barra lateral (tablet/desktop) e no cabeçalho do celular.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "react-router";
import { CreditCard, Gear, ShieldCheck, SignOut, Sparkle, UserCircle } from "@phosphor-icons/react";
import { useUser } from "@/api/session";
import { avatarUrl } from "@/api/settings";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { useLogoutFlow } from "./logout";

function initial(name: string | null | undefined, email: string | undefined) {
  const src = (name || email || "?").trim();
  return src.charAt(0).toUpperCase();
}

export function Avatar({ size = 32, className }: { size?: number; className?: string }) {
  const user = useUser();
  const url = avatarUrl(user);
  if (url) {
    return <img src={url} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-accent-800 font-semibold text-accent-100", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {initial(user?.name, user?.email)}
    </span>
  );
}

const item =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[14px] text-primary outline-none data-[highlighted]:bg-accent-900 data-[highlighted]:text-accent";

export function ProfileMenu({ trigger, align = "end" }: { trigger: React.ReactNode; align?: "start" | "end" | "center" }) {
  const user = useUser();
  const online = useOnline();
  const { leave, dialog } = useLogoutFlow(online);
  if (!user) return null;
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align={align}
            sideOffset={8}
            collisionPadding={12}
            className="z-50 w-[min(280px,calc(100vw-24px))] rounded-[16px] border border-divider bg-surface p-1.5 shadow-lg"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar size={40} />
              <div className="min-w-0">
                <p className="m-0 truncate text-[14px] font-medium">{user.name || "Sua conta"}</p>
                <p className="m-0 truncate text-[12px] text-neutral-400">{user.email}</p>
              </div>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-divider" />
            <DropdownMenu.Item asChild className={item}>
              <Link to="/app/preferencias#conta">
                <UserCircle size={18} aria-hidden /> Minha conta
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild className={item}>
              <Link to="/app/preferencias">
                <Gear size={18} aria-hidden /> Preferências
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild className={item}>
              <Link to="/app/planos">
                <CreditCard size={18} aria-hidden /> Meu plano
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild className={item}>
              <Link to="/app/conquistas">
                <Sparkle size={18} aria-hidden /> Conquistas
              </Link>
            </DropdownMenu.Item>
            {user.role === "admin" ? (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-divider" />
                <DropdownMenu.Item asChild className={item}>
                  <Link to="/admin">
                    <ShieldCheck size={18} aria-hidden /> Painel administrativo
                  </Link>
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Separator className="my-1 h-px bg-divider" />
            <DropdownMenu.Item className={cn(item, "text-error data-[highlighted]:bg-error-tint data-[highlighted]:text-error")} onSelect={leave}>
              <SignOut size={18} aria-hidden /> Sair da conta
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {dialog}
    </>
  );
}
