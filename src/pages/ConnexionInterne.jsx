import React, { useEffect } from "react";
import { getLoginUrl } from "@/lib/authRedirect";

export default function ConnexionInterne() {
  useEffect(() => {
    window.location.replace(getLoginUrl());
  }, []);

  return null;
}
