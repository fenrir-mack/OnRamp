import { useEffect, useState } from "react";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function EmployeeAvatar({ employeeId, name, className = "" }: { employeeId: number; name: string; className?: string }) {
  const [photoUnavailable, setPhotoUnavailable] = useState(false);

  useEffect(() => setPhotoUnavailable(false), [employeeId]);

  return (
    <span className={`employee-avatar ${className}`} aria-hidden="true">
      {initials(name)}
      {!photoUnavailable && <img src={`/api/employees/${employeeId}/profile-photo`} alt="" onError={() => setPhotoUnavailable(true)} />}
    </span>
  );
}
