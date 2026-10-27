import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Sign-in is opt-in: it switches on only when all three secrets are configured,
 * so a fresh clone (and the bundled sample) keeps working with zero setup.
 */
export const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token, profile }) {
      // A stable, provider-scoped id; GitHub usernames can change, numeric ids cannot.
      if (profile?.id != null) token.uid = `github:${profile.id}`;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
