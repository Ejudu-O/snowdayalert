

// public/snow-engine.js
// High-performance physics-driven particle snow engine

(function() {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = {
        maxParticles: {
            none: 0,
            light: 40,
            steady: 90,
            blizzard: 180
        },
        baseSpeed: {
            light: 0.3,
            steady: 0.6,
            blizzard: 1.2
        },
        baseSize: {
            light: { min: 1, max: 3 },
            steady: { min: 1.5, max: 4 },
            blizzard: { min: 2, max: 5 }
        },
        windTilt: {
            light: 0.1,
            steady: 0.3,
            blizzard: 0.8
        },
        swayAmplitude: {
            light: 1.5,
            steady: 0.8,
            blizzard: 0.3
        },
        opacity: {
            light: 0.6,
            steady: 0.75,
            blizzard: 0.85
        }
    };

    // ============================================================
    // DOM REFERENCES
    // ============================================================
    const canvas = document.getElementById('snowCanvas');
    if (!canvas) {
        console.error('Snow canvas element not found');
        return;
    }

    const ctx = canvas.getContext('2d');
    let animationId = null;
    let isActive = false;
    let isPaused = false;
    let currentState = 'none';
    let particles = [];
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    // ============================================================
    // SNOWFLAKE CLASS
    // ============================================================
    class Snowflake {
        constructor(state) {
            this.reset(state);
        }

        reset(state) {
            const config = getStateConfig(state);
            const sizeRange = config.sizeRange;
            
            this.x = Math.random() * viewportWidth;
            this.y = Math.random() * viewportHeight - viewportHeight;
            this.radius = sizeRange.min + Math.random() * (sizeRange.max - sizeRange.min);
            this.opacity = config.opacity * (0.7 + Math.random() * 0.3);
            this.speed = config.speed * (0.8 + Math.random() * 0.4);
            this.wind = (Math.random() - 0.5) * config.windTilt * 2;
            this.sway = Math.random() * Math.PI * 2;
            this.swaySpeed = 0.01 + Math.random() * 0.02;
            this.swayAmplitude = config.swayAmplitude * (0.5 + Math.random() * 0.5);
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.02;
        }

        update() {
            const state = currentState;
            const config = getStateConfig(state);
            
            this.y += this.speed * (1 + (state === 'blizzard' ? 0.3 : 0));
            
            this.sway += this.swaySpeed;
            const swayOffset = Math.sin(this.sway) * this.swayAmplitude;
            this.x += this.wind + swayOffset * 0.5;
            
            if (state === 'blizzard') {
                this.x += config.windTilt * 0.6;
            }
            
            this.rotation += this.rotationSpeed;

            if (this.y > viewportHeight + 20) {
                this.reset(state);
                this.y = -20;
                this.x = Math.random() * viewportWidth;
            }
            if (this.x > viewportWidth + 20) {
                this.x = -20;
            }
            if (this.x < -20) {
                this.x = viewportWidth + 20;
            }
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`);
            gradient.addColorStop(0.5, `rgba(255, 255, 255, ${this.opacity * 0.6})`);
            gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
            
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 0.9})`;
            ctx.fill();
            
            if (this.radius > 3) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.3})`;
                ctx.lineWidth = 0.5;
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 + this.rotation;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(angle) * this.radius * 1.2, Math.sin(angle) * this.radius * 1.2);
                    ctx.stroke();
                }
            }
            
            ctx.restore();
        }
    }

    // ============================================================
    // STATE CONFIGURATION
    // ============================================================
    function getStateConfig(state) {
        const configs = {
            none: {
                maxParticles: 0,
                speed: 0,
                sizeRange: { min: 0, max: 0 },
                windTilt: 0,
                swayAmplitude: 0,
                opacity: 0
            },
            light: {
                maxParticles: CONFIG.maxParticles.light,
                speed: CONFIG.baseSpeed.light,
                sizeRange: CONFIG.baseSize.light,
                windTilt: CONFIG.windTilt.light,
                swayAmplitude: CONFIG.swayAmplitude.light,
                opacity: CONFIG.opacity.light
            },
            steady: {
                maxParticles: CONFIG.maxParticles.steady,
                speed: CONFIG.baseSpeed.steady,
                sizeRange: CONFIG.baseSize.steady,
                windTilt: CONFIG.windTilt.steady,
                swayAmplitude: CONFIG.swayAmplitude.steady,
                opacity: CONFIG.opacity.steady
            },
            blizzard: {
                maxParticles: CONFIG.maxParticles.blizzard,
                speed: CONFIG.baseSpeed.blizzard,
                sizeRange: CONFIG.baseSize.blizzard,
                windTilt: CONFIG.windTilt.blizzard,
                swayAmplitude: CONFIG.swayAmplitude.blizzard,
                opacity: CONFIG.opacity.blizzard
            }
        };
        return configs[state] || configs.none;
    }

    // ============================================================
    // PARTICLE MANAGEMENT
    // ============================================================
    function createParticles(state) {
        const config = getStateConfig(state);
        const count = config.maxParticles;
        particles = [];
        for (let i = 0; i < count; i++) {
            particles.push(new Snowflake(state));
        }
    }

    function updateParticles() {
        const config = getStateConfig(currentState);
        while (particles.length < config.maxParticles) {
            particles.push(new Snowflake(currentState));
        }
        while (particles.length > config.maxParticles + 10) {
            particles.pop();
        }
        
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
        }
    }

    function drawParticles() {
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        
        if (currentState === 'none' || particles.length === 0) {
            return;
        }
        
        const sorted = [...particles].sort((a, b) => a.radius - b.radius);
        
        for (let i = 0; i < sorted.length; i++) {
            sorted[i].draw(ctx);
        }
    }

    // ============================================================
    // ANIMATION LOOP
    // ============================================================
    function animate() {
        if (!isActive || isPaused) {
            animationId = null;
            return;
        }
        
        updateParticles();
        drawParticles();
        animationId = requestAnimationFrame(animate);
    }

    function startAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        isActive = true;
        isPaused = false;
        animate();
    }

    function stopAnimation() {
        isActive = false;
        isPaused = false;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    }

    function pauseAnimation() {
        isPaused = true;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function resumeAnimation() {
        if (isActive && isPaused) {
            isPaused = false;
            animate();
        }
    }

    // ============================================================
    // ENGINE CONTROL
    // ============================================================
    function adjustSnowEngine(snowCm) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            stopAnimation();
            return;
        }
        
        let newState = 'none';
        
        if (snowCm > 0 && snowCm <= 2) {
            newState = 'light';
        } else if (snowCm > 2 && snowCm <= 10) {
            newState = 'steady';
        } else if (snowCm > 10) {
            newState = 'blizzard';
        } else {
            newState = 'none';
        }
        
        if (newState !== currentState) {
            currentState = newState;
            
            if (currentState === 'none') {
                stopAnimation();
                return;
            }
            
            createParticles(currentState);
            
            if (!isActive) {
                startAnimation();
            } else if (isPaused) {
                resumeAnimation();
            }
        }
    }

    function toggleSnow() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }
        
        if (isActive && !isPaused) {
            pauseAnimation();
        } else if (isActive && isPaused) {
            resumeAnimation();
        } else {
            if (currentState !== 'none') {
                startAnimation();
            } else {
                currentState = 'light';
                createParticles('light');
                startAnimation();
            }
        }
    }

    function getState() {
        return {
            state: currentState,
            isActive: isActive,
            isPaused: isPaused,
            particleCount: particles.length
        };
    }

    // ============================================================
    // VIEWPORT MANAGEMENT
    // ============================================================
    function resizeCanvas() {
        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;
        canvas.width = viewportWidth;
        canvas.height = viewportHeight;
        
        if (isActive && currentState !== 'none') {
            createParticles(currentState);
        }
    }

    // ============================================================
    // ACCESSIBILITY - Reduced Motion
    // ============================================================
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    function handleReducedMotionChange() {
        if (reducedMotionQuery.matches) {
            stopAnimation();
        } else {
            if (currentState !== 'none') {
                startAnimation();
            }
        }
    }
    
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    
    if (reducedMotionQuery.matches) {
        stopAnimation();
    }

    // ============================================================
    // WINDOW EVENT BINDING
    // ============================================================
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 300);
    });

    // ============================================================
    // INITIALIZATION
    // ============================================================
    function init() {
        resizeCanvas();
        
        const initialSnow = window.serverSnowCm || 0;
        
        if (initialSnow > 0 && !reducedMotionQuery.matches) {
            adjustSnowEngine(initialSnow);
        } else {
            currentState = 'none';
            particles = [];
            ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        }
        
        const toggleBtn = document.getElementById('toggleSnowBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleSnow);
        }
        
        console.log('Snow Engine initialized with state:', getState());
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    window.snowEngine = {
        adjust: adjustSnowEngine,
        toggle: toggleSnow,
        getState: getState,
        resize: resizeCanvas,
        pause: pauseAnimation,
        resume: resumeAnimation,
        stop: stopAnimation,
        start: startAnimation,
        setState: (state) => {
            if (['none', 'light', 'steady', 'blizzard'].includes(state)) {
                currentState = state;
                if (state === 'none') {
                    stopAnimation();
                } else {
                    createParticles(state);
                    if (!isActive || isPaused) {
                        startAnimation();
                    }
                }
            }
        }
    };

    // ============================================================
    // START
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();