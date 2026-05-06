'use client';

import { useState, useEffect } from 'react';
import { useConfig, useUpdateConfig } from '@/hooks/use-config';
import { useScrapeStatus, useTriggerScrape } from '@/hooks/use-scrape';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { data: config, isLoading: configLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const { data: lastScrape } = useScrapeStatus();
  const triggerScrape = useTriggerScrape();

  const [zip, setZip] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [mileageMax, setMileageMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [cronInterval, setCronInterval] = useState('30');
  const [fbEnabled, setFbEnabled] = useState(false);
  const [makesModels, setMakesModels] = useState<string[]>([]);

  useEffect(() => {
    if (config) {
      setZip(config.zip ?? '92648');
      setRadiusMiles(String(config.radiusMiles ?? 150));
      setPriceMax(String((config.priceMax ?? 1500000) / 100));
      setMileageMax(String(config.mileageMax ?? 200000));
      setYearMin(String(config.yearMin ?? 2005));
      setYearMax(String(config.yearMax ?? 2025));
      setCronInterval(String(config.cronInterval ?? 30));
      setFbEnabled(config.fbEnabled ?? false);
      try {
        setMakesModels(JSON.parse(config.makesModels ?? '[]'));
      } catch {
        setMakesModels(['Toyota Tacoma', 'Toyota 4Runner']);
      }
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate(
      {
        zip,
        radiusMiles: Number(radiusMiles),
        priceMax: Math.round(Number(priceMax) * 100),
        mileageMax: Number(mileageMax),
        yearMin: Number(yearMin),
        yearMax: Number(yearMax),
        cronInterval: Number(cronInterval),
        fbEnabled,
        makesModels: JSON.stringify(makesModels),
      },
      {
        onSuccess: () => toast.success('Settings saved'),
        onError: () => toast.error('Failed to save settings'),
      }
    );
  };

  const handleScan = () => {
    triggerScrape.mutate(undefined, {
      onSuccess: () => toast.success('Scan started'),
      onError: (err) => toast.error(err.message || 'Failed to start scan'),
    });
  };

  const vehicleOptions = ['Toyota Tacoma', 'Toyota 4Runner', 'Toyota Tundra', 'Toyota Highlander'];

  const toggleVehicle = (vehicle: string) => {
    setMakesModels((prev) =>
      prev.includes(vehicle) ? prev.filter((v) => v !== vehicle) : [...prev, vehicle]
    );
  };

  if (configLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Search Criteria */}
        <Card>
          <CardHeader>
            <CardTitle>Search Criteria</CardTitle>
            <CardDescription>Configure what vehicles to search for</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">ZIP Code</label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="92648" />
              </div>
              <div>
                <label className="text-sm font-medium">Radius (miles)</label>
                <Input
                  type="number"
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(e.target.value)}
                  min={10}
                  max={500}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Max Price ($)</label>
                <Input
                  type="number"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  min={0}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Mileage</label>
                <Input
                  type="number"
                  value={mileageMax}
                  onChange={(e) => setMileageMax(e.target.value)}
                  min={0}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Year Min</label>
                <Input
                  type="number"
                  value={yearMin}
                  onChange={(e) => setYearMin(e.target.value)}
                  min={1990}
                  max={2030}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Year Max</label>
                <Input
                  type="number"
                  value={yearMax}
                  onChange={(e) => setYearMax(e.target.value)}
                  min={1990}
                  max={2030}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Vehicles</label>
              <div className="flex flex-wrap gap-2">
                {vehicleOptions.map((vehicle) => (
                  <Button
                    key={vehicle}
                    variant={makesModels.includes(vehicle) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleVehicle(vehicle)}
                  >
                    {vehicle}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleSave} disabled={updateConfig.isPending} className="w-full">
              {updateConfig.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Search Criteria
            </Button>
          </CardContent>
        </Card>

        {/* Scraper Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Scraper Schedule</CardTitle>
            <CardDescription>How often to scan for new listings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Scan Interval</label>
              <div className="flex gap-2 mt-1">
                {['15', '30', '60'].map((interval) => (
                  <Button
                    key={interval}
                    variant={cronInterval === interval ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setCronInterval(interval);
                      updateConfig.mutate(
                        { cronInterval: Number(interval) },
                        { onSuccess: () => toast.success(`Interval set to ${interval} min`) }
                      );
                    }}
                  >
                    {interval} min
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Changes take effect on the next worker tick. No restart required.
              </p>
            </div>

            <div className="pt-4 border-t space-y-2">
              <Button
                onClick={handleScan}
                disabled={triggerScrape.isPending}
                variant="outline"
                className="w-full"
              >
                {triggerScrape.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Scan Now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => {
                  fetch('/api/scrape/clear', { method: 'POST' })
                    .then(r => r.json())
                    .then(d => toast.success(`Cleared ${d.cleared} stuck scan(s)`))
                    .catch(() => toast.error('Failed to clear'));
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Clear Stuck Scans
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Facebook Marketplace */}
        <Card>
          <CardHeader>
            <CardTitle>Facebook Marketplace</CardTitle>
            <CardDescription>Private-party listings from Facebook</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Enable FB Marketplace</span>
              <Button
                variant={fbEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const newVal = !fbEnabled;
                  setFbEnabled(newVal);
                  updateConfig.mutate(
                    { fbEnabled: newVal },
                    {
                      onSuccess: () =>
                        toast.success(`Facebook Marketplace ${newVal ? 'enabled' : 'disabled'}`),
                    }
                  );
                }}
              >
                {fbEnabled ? 'ON' : 'OFF'}
              </Button>
            </div>
            {fbEnabled && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Experimental — requires Facebook credentials and a disposable account.
                  May violate Facebook ToS. Use at your own risk.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Configure FB_EMAIL and FB_PASSWORD in your .env.local file.
            </p>
          </CardContent>
        </Card>

        {/* Scrape History */}
        <Card>
          <CardHeader>
            <CardTitle>Scrape History</CardTitle>
            <CardDescription>Recent scrape runs</CardDescription>
          </CardHeader>
          <CardContent>
            {lastScrape ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">{lastScrape.source}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          lastScrape.status === 'completed'
                            ? 'default'
                            : lastScrape.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {lastScrape.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{lastScrape.newCount ?? 0}</TableCell>
                    <TableCell>{lastScrape.updatedCount ?? 0}</TableCell>
                    <TableCell className="text-xs">
                      {lastScrape.startedAt
                        ? new Date(lastScrape.startedAt).toLocaleString()
                        : '—'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No scrape runs yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
