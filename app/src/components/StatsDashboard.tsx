import { useState, useEffect } from 'react';
import { getUsageStats, getCostStats } from '../services/api';
import { BarChart3, X } from 'lucide-react';
import type { UsageStats, CostStats } from '../types';

export function StatsDashboard() {
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [costs, setCosts] = useState<CostStats | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const refreshStats = async () => {
        setLoading(true);
        try {
            const [s, c] = await Promise.all([getUsageStats(), getCostStats()]);
            setStats(s);
            setCosts(c);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            refreshStats();
            // Frequent refresh if open
            const interval = setInterval(refreshStats, 30000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    return (
        <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${isOpen ? 'w-80' : 'w-12 h-12'}`}>
            {isOpen ? (
                <div className="bg-card/95 backdrop-blur-md border border-metal rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="p-4 border-b border-metal flex justify-between items-center bg-plate/50">
                        <h3 className="font-display text-sm tracking-tight text-info uppercase">Server Analytics</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-muted hover:text-foreground transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        {/* Queue Status */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-void/50 p-2 rounded border border-metal/30">
                                <p className="text-[10px] text-muted uppercase">In Queue</p>
                                <p className={`text-xl font-mono ${stats?.queueLength ? 'text-warning' : 'text-muted'}`}>
                                    {stats ? stats.queueLength : '—'}
                                </p>
                            </div>
                            <div className="bg-void/50 p-2 rounded border border-metal/30">
                                <p className="text-[10px] text-muted uppercase">Processing</p>
                                <p className={`text-xl font-mono ${stats?.activeJobs ? 'text-info animate-pulse' : 'text-muted'}`}>
                                    {stats ? stats.activeJobs : '—'}
                                </p>
                            </div>
                        </div>

                        {/* Splat Counters */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-void/50 p-2 rounded border border-metal/30">
                                <p className="text-[10px] text-muted uppercase">Today</p>
                                <p className="text-xl font-mono text-success">
                                    {stats ? stats.thisDay : '—'}
                                </p>
                            </div>
                            <div className="bg-void/50 p-2 rounded border border-metal/30">
                                <p className="text-[10px] text-muted uppercase">All Time</p>
                                <p className="text-xl font-mono text-foreground">
                                    {stats ? stats.allTime : '—'}
                                </p>
                            </div>
                        </div>

                        {/* Hourly Graph (Last 24h) */}
                        <div className="pt-2 border-t border-metal/30">
                            <p className="text-[10px] text-muted uppercase mb-2">Last 24 Hours</p>
                            <div className="flex items-end gap-0.5 h-12">
                                {(stats?.hourlyBreakdown || Array(24).fill(0)).map((count, i) => {
                                    const max = Math.max(...(stats?.hourlyBreakdown || [1]), 1);
                                    const height = (count / max) * 100;
                                    return (
                                        <div
                                            key={i}
                                            className="flex-1 bg-info/60 hover:bg-info transition-all rounded-t"
                                            style={{ height: `${Math.max(height, 2)}%` }}
                                            title={`${24 - i}h ago: ${count} splats`}
                                        />
                                    );
                                })}
                            </div>
                            <div className="flex justify-between text-[8px] text-muted mt-1">
                                <span>24h ago</span>
                                <span>now</span>
                            </div>
                        </div>

                        {/* Cost Breakdown */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <p className="text-[10px] text-muted uppercase">Est. Usage Cost</p>
                                <p className="text-sm font-mono text-warning">
                                    {costs ? `${costs.estimatedUsageCost.toFixed(2)} ${costs.currency}` : '—'}
                                </p>
                            </div>
                            <div className="h-1.5 w-full bg-void rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-info transition-all duration-1000"
                                    style={{ width: stats ? `${Math.min((stats.thisDay / 50) * 100, 100)}%` : '0%' }}
                                />
                            </div>
                            <p className="text-[9px] text-muted leading-tight">
                                Base operational cost: ~${costs?.monthlyFixedCost.toFixed(2)}/mo
                                <br />
                                {costs?.note}
                            </p>
                        </div>

                        {/* Time Distribution */}
                        <div className="pt-2 border-t border-metal/30">
                            <p className="text-[10px] text-muted uppercase mb-2">Recent Intervals</p>
                            <div className="space-y-1">
                                <IntervalRow label="Hour" count={stats?.thisHour} max={10} />
                                <IntervalRow label="Month" count={stats?.thisMonth} max={500} />
                                <IntervalRow label="Year" count={stats?.thisYear} max={5000} />
                            </div>
                        </div>

                        <button
                            onClick={refreshStats}
                            disabled={loading}
                            className="w-full py-1.5 text-[10px] uppercase tracking-widest text-muted hover:text-info transition-colors border border-metal/50 rounded hover:border-info/50"
                        >
                            {loading ? 'Refreshing...' : 'Refresh Stats'}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-full h-full bg-info text-void rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform active:scale-95 border-2 border-void"
                    title="View statistics"
                >
                    <BarChart3 size={20} />
                </button>
            )}
        </div>
    );
}

function IntervalRow({ label, count, max = 100 }: { label: string, count?: number, max?: number }) {
    const percentage = count ? Math.min((count / max) * 100, 100) : 0;
    return (
        <div className="flex items-center gap-3">
            <span className="text-[10px] w-10 text-muted">{label}</span>
            <div className="flex-1 h-1 bg-void rounded-full overflow-hidden">
                <div
                    className="h-full bg-metal/50 transition-all duration-1000"
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="text-[10px] font-mono w-6 text-right text-muted">{count ?? 0}</span>
        </div>
    );
}
