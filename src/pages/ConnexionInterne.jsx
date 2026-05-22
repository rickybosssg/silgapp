import React, { useEffect } from "react";
import { APP_PUBLIC_URL } from "@/lib/app-params";

export default function ConnexionInterne() {
  useEffect(() => {
    window.location.replace(APP_PUBLIC_URL);
  }, []);

  return null;
}
