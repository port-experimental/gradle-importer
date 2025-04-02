type LogLevel = 'error' | 'warn' | 'log' | 'info' | 'debug';

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'info', 'debug'];

export function configureLogging() {
    // Get current log level from environment or default to 'log'
    const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'log';
    const currentLevelIndex = LOG_LEVELS.indexOf(currentLevel);
    
    // Override console methods based on the current log level
    LOG_LEVELS.forEach((level, index) => {
        const originalMethod = console[level] as (...args: any[]) => void;
        
        console[level] = (...args: any[]) => {
            if (index <= currentLevelIndex) {
                originalMethod.apply(console, args);
            }
        };
    });
}
