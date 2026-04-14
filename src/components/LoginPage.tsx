import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Lock, Mail } from 'lucide-react';
import { motion } from 'motion/react';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      await login(email);
    } catch (error) {
      // Error handled in context
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-red-200">
            <LayoutDashboard className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Vasta</h1>
        </div>

        <Card className="border-slate-200 shadow-xl shadow-slate-200/50">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Team Access</CardTitle>
            <CardDescription>
              Enter your email to access the internal dashboard.
              <br />
              <span className="text-red-600 font-medium text-xs mt-2 block">Invite-only access enabled</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@vastasports.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full bg-red-600 hover:bg-red-700 h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Sign In
                  </div>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-sm text-slate-500">
          Don't have access? Contact your administrator for an invitation.
        </p>
      </motion.div>
    </div>
  );
}
