import { SignIn } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";

export default function SignInPage() {
  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Sign in to access your FundCircle workspace."
      features={["Google Login", "Email Login", "Secure Clerk Authentication"]}
      ctaText="New to FundCircle?"
      ctaLink="/sign-up"
      ctaRoleLabel="Create Account"
    >
      <div className="space-y-6">
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </div>
    </AuthLayout>
  );
}
