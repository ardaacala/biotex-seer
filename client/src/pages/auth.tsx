import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import biotexLogo from '@assets/white-logo_1772614993528.png';
import surgeryBg from '@assets/75475f5a-f277-41e3-bbc5-78383ad7966b_1774868523429.jpg';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { login, register, isLoggingIn, isRegistering } = useAuth();
  const { toast } = useToast();

  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setRemaining(null);
    try {
      if (isLogin) {
        await login({ ...formData });
      } else {
        await register({ ...formData, role: 'user' });
      }
      setLocation('/');
    } catch (err: unknown) {
      const e = (err ?? {}) as {
        message?: string;
        remaining?: number;
      };
      setLoginError(e.message ?? 'Giriş başarısız.');
      if (typeof e.remaining === 'number') setRemaining(e.remaining);
    }
  };

  const handleModeSwitch = () => {
    setIsLogin(!isLogin);
  };

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden">
      {/* Tam ekran blurlu ameliyathane arka planı */}
      <img src={surgeryBg} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: 'blur(4px)', transform: 'scale(1.05)' }} />
      {/* Mavi filtre katmanı */}
      <div className="absolute inset-0 bg-primary/45 pointer-events-none" />
      {/* Sol taraf — Masaüstü markalaşma */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 text-primary-foreground relative overflow-hidden z-10">
        <div className="relative z-10">
          <div className="flex items-stretch gap-4 mt-12" style={{ transform: 'scale(0.9)', transformOrigin: 'left center' }}>
            <img src={biotexLogo} alt="Biotex" className="self-stretch w-auto object-contain" />
            <div>
              <h1 className="text-8xl font-bold drop-shadow-lg leading-tight">
                <span style={{ color: '#ffffff' }}>Biotex</span><span style={{ color: '#a8c800' }}>Seer</span>
              </h1>
              <p className="text-white/70 text-lg font-medium tracking-wide mt-1 ml-[5px]">Akıllı Sipariş Takip Uygulaması</p>
            </div>
          </div>
        </div>
        
      </div>
      {/* Sağ taraf — Form */}
      <div className="flex-1 flex items-center justify-center p-6 z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex justify-center mb-10">
            <img src={biotexLogo} alt="Biotex" className="h-14 object-contain" />
          </div>

          <Card className="glass-card border-0 shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="space-y-3 pb-8 pt-10 px-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={isLogin ? 'login' : 'register'}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <CardTitle className="text-3xl font-display">
                    {isLogin ? 'Tekrar hoş geldiniz' : 'Hesap oluştur'}
                  </CardTitle>
                  <CardDescription className="text-base mt-2">
                    {isLogin 
                      ? 'Panele erişmek için bilgilerinizi girin' 
                      : 'Üretim kayıtlarını takip etmeye başlamak için kayıt olun'}
                  </CardDescription>
                </motion.div>
              </AnimatePresence>
            </CardHeader>
            <CardContent className="px-8 pb-10">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-muted-foreground ml-1">Kullanıcı Adı</Label>
                    <div className="relative group">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input 
                        id="username"
                        placeholder="Kullanıcı adınız"
                        required
                        autoComplete="username"
                        className="pl-12 py-6 rounded-2xl bg-muted/50 border-border/50 focus:bg-background transition-all text-base"
                        value={formData.username}
                        onChange={(e) => setFormData(p => ({...p, username: e.target.value}))}
                        data-testid="input-username"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-muted-foreground ml-1">Şifre</Label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input 
                        id="password" 
                        type="password"
                        placeholder="••••••••" 
                        required
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        className="pl-12 py-6 rounded-2xl bg-muted/50 border-border/50 focus:bg-background transition-all text-base"
                        value={formData.password}
                        onChange={(e) => setFormData(p => ({...p, password: e.target.value}))}
                        data-testid="input-password"
                      />
                    </div>
                  </div>
                </div>

                {loginError && (
                  <div className="text-sm space-y-0.5">
                    <p className="text-red-500 font-medium">{loginError}</p>
                    {remaining !== null && (
                      <p className="text-red-400 text-xs">{remaining} deneme hakkınız kaldı.</p>
                    )}
                  </div>
                )}

                <Button 
                  type="submit"
                  disabled={isLoggingIn || isRegistering}
                  className="w-full py-6 rounded-2xl text-lg font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
                  data-testid="button-submit"
                >
                  {isLoggingIn || isRegistering ? 'Lütfen bekleyin...' : (
                    <span className="flex items-center gap-2">
                      {isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
                      <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center space-y-3">
                <button
                  type="button"
                  onClick={handleModeSwitch}
                  className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors block w-full"
                  data-testid="button-toggle-auth"
                >
                  {isLogin 
                    ? "Hesabınız yok mu? Kayıt olun" 
                    : "Zaten hesabınız var mı? Giriş yapın"}
                </button>

              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
