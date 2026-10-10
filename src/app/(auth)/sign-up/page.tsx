import type { Metadata } from "next";
import { SignUpFlow } from "./sign-up-flow";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <SignUpFlow />;
}
