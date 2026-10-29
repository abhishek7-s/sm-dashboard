import { logout } from "../login/actions";

type LogoutButtonProps = {
  className?: string;
  label?: string;
};

export function LogoutButton({ className, label = "Sign out" }: LogoutButtonProps) {
  return (
    <form action={logout}>
      <button type="submit" className={className} title="Sign out" aria-label="Sign out">
        {label}
      </button>
    </form>
  );
}
