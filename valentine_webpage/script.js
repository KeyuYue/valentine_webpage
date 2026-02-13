/* ============================================
   Valentine's Day Webpage — Script
   ============================================ */

// --- 1. 全局变量 & 状态 ---
const canvas = document.getElementById('heart-canvas');
const ctx = canvas.getContext('2d');
let width, height;
let heartParticles = [];
let fogParticles = [];
let appState = 'LANDING'; // 'LANDING' or 'INTERACTIVE'

// 3D 旋转参数
let rotationY = 0;
let targetRotationSpeed = 0.002;
let currentRotationSpeed = 0.002;

// 鼠标/触摸交互
const pointer = { x: 0, y: 0, active: false, moving: false };
let lastPointerTime = 0;

// 陀螺仪
let gyroAvailable = false;
let gyroGamma = 0; // 左右倾斜角

// 触摸滑动（第二页备选交互）
let touchStartX = 0;
let touchDeltaX = 0;

// --- 2. Canvas 尺寸 ---
function resize() {
    // 使用 visualViewport 获取实际可见区域（修复安卓地址栏收缩问题）
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    width = canvas.width = vw;
    height = canvas.height = vh;
}
window.addEventListener('resize', resize);
// 安卓横竖屏切换
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// =============================================
//  雾气粒子系统
// =============================================

// 预渲染模糊圆到离屏 Canvas（性能优化，避免每帧 ctx.filter）
const fogCache = document.createElement('canvas');
const fogCacheCtx = fogCache.getContext('2d');
const FOG_CACHE_SIZE = 256;
fogCache.width = FOG_CACHE_SIZE;
fogCache.height = FOG_CACHE_SIZE;

(function renderFogCache() {
    const r = FOG_CACHE_SIZE / 2;
    const gradient = fogCacheCtx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    fogCacheCtx.fillStyle = gradient;
    fogCacheCtx.fillRect(0, 0, FOG_CACHE_SIZE, FOG_CACHE_SIZE);
})();

class FogParticle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 150 + 80;
        this.opacity = Math.random() * 0.12 + 0.04;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.15;
        this.baseVx = this.vx;
        this.baseVy = this.vy;
    }

    update() {
        // 鼠标排斥
        const dx = this.x - pointer.x;
        const dy = this.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const repelRadius = 180;

        if (pointer.moving && dist < repelRadius && dist > 0) {
            const force = (repelRadius - dist) / repelRadius * 0.8;
            this.vx += (dx / dist) * force;
            this.vy += (dy / dist) * force;
        }

        // 速度阻尼，缓慢恢复
        this.vx += (this.baseVx - this.vx) * 0.02;
        this.vy += (this.baseVy - this.vy) * 0.02;

        this.x += this.vx;
        this.y += this.vy;

        // 循环边界
        if (this.x < -this.size) this.x = width + this.size;
        if (this.x > width + this.size) this.x = -this.size;
        if (this.y < -this.size) this.y = height + this.size;
        if (this.y > height + this.size) this.y = -this.size;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        const drawSize = this.size * 2;
        ctx.drawImage(fogCache, this.x - drawSize / 2, this.y - drawSize / 2, drawSize, drawSize);
        ctx.restore();
    }
}

function initFog() {
    fogParticles = [];
    const count = window.innerWidth < 768 ? 15 : 25;
    for (let i = 0; i < count; i++) {
        fogParticles.push(new FogParticle());
    }
}

// =============================================
//  心形粒子系统
// =============================================

class HeartParticle {
    constructor(mode) {
        this.reset(mode);
    }

    reset(mode) {
        this.mode = mode; // '2D' or '3D'
        this.size = Math.random() * 15 + 5;
        this.opacity = Math.random() * 0.5 + 0.3;
        // 粉色/玫瑰色系，在浅粉背景上可见
        const hue = Math.random() * 30 + 330; // 330~360 粉红色调
        const sat = Math.random() * 30 + 60;  // 60~90% 饱和度
        const light = Math.random() * 20 + 70; // 70~90% 亮度
        this.color = `hsla(${hue}, ${sat}%, ${light}%, ${this.opacity})`;

        if (mode === '2D') {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 1.2;
            this.vy = (Math.random() - 0.5) * 1.2;
            this.rotation = Math.random() * 360;
        } else {
            // 3D 球体分布
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const radius = Math.random() * (Math.min(width, height) * 0.35) + 50;

            this.x3d = radius * Math.sin(phi) * Math.cos(theta);
            this.y3d = radius * Math.sin(phi) * Math.sin(theta);
            this.z3d = radius * Math.cos(phi);

            this.scale = 0;
            this.targetScale = 1;

            // 拖尾系统
            this.trail = [];
            this.trailLength = 6;
        }
    }

    draw2D() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.fillStyle = this.color;
        this.drawShape();
        ctx.restore();
    }

    draw3D() {
        const cosR = Math.cos(rotationY);
        const sinR = Math.sin(rotationY);

        const rx = this.x3d * cosR - this.z3d * sinR;
        const rz = this.z3d * cosR + this.x3d * sinR;
        const ry = this.y3d;

        const fov = 800;
        const projScale = fov / (fov + rz);

        if (projScale > 0) {
            const x2d = width / 2 + rx * projScale;
            const y2d = height / 2 + ry * projScale;
            const alpha = Math.min(1, (this.opacity + 0.2) * projScale);

            // --- 拖尾 ---
            this.trail.push({ x: x2d, y: y2d, s: projScale, a: alpha });
            if (this.trail.length > this.trailLength) this.trail.shift();

            // 绘制拖尾（从旧到新）
            for (let i = 0; i < this.trail.length - 1; i++) {
                const t = this.trail[i];
                const ratio = (i + 1) / this.trail.length;
                ctx.save();
                ctx.globalAlpha = t.a * ratio * 0.25;
                ctx.translate(t.x, t.y);
                const trailScale = t.s * this.scale * ratio;
                ctx.scale(trailScale, trailScale);
                ctx.fillStyle = `rgba(255, 182, 193, 1)`; // 粉色拖尾
                this.drawShape();
                ctx.restore();
            }

            // --- 主体 + 光晕 ---
            ctx.save();
            ctx.translate(x2d, y2d);
            ctx.scale(projScale * this.scale, projScale * this.scale);
            ctx.globalAlpha = alpha;

            // 光晕
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(255, 182, 193, 0.5)';
            ctx.fillStyle = 'white';
            this.drawShape();
            ctx.restore();
        }
    }

    drawShape() {
        ctx.beginPath();
        const s = this.size / 10;
        ctx.moveTo(0, -5 * s);
        ctx.bezierCurveTo(-5 * s, -12 * s, -15 * s, -5 * s, 0, 8 * s);
        ctx.bezierCurveTo(15 * s, -5 * s, 5 * s, -12 * s, 0, -5 * s);
        ctx.fill();
    }

    update() {
        if (this.mode === '2D') {
            // --- 吸引力交互 ---
            const dx = pointer.x - this.x;
            const dy = pointer.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const attractRadius = 220;

            if (pointer.active && dist < attractRadius && dist > 0) {
                const force = (attractRadius - dist) / attractRadius;
                this.vx += (dx / dist) * force * 0.6;
                this.vy += (dy / dist) * force * 0.6;
            }

            // 速度阻尼
            this.vx *= 0.97;
            this.vy *= 0.97;

            this.x += this.vx;
            this.y += this.vy;

            // 边界循环
            if (this.x < -50) this.x = width + 50;
            if (this.x > width + 50) this.x = -50;
            if (this.y < -50) this.y = height + 50;
            if (this.y > height + 50) this.y = -50;

            this.rotation += 0.3;
        } else {
            // 3D 缓动出现
            if (this.scale < this.targetScale) this.scale += 0.02;
            // 轻微浮动
            this.y3d += Math.sin(Date.now() * 0.001 + this.x3d) * 0.2;
        }
    }
}

function initHeartParticles(mode) {
    heartParticles = [];
    const count = mode === '2D'
        ? (window.innerWidth < 768 ? 40 : 100)
        : (window.innerWidth < 768 ? 150 : 300);
    for (let i = 0; i < count; i++) {
        heartParticles.push(new HeartParticle(mode));
    }
}

// =============================================
//  主动画循环
// =============================================

function animate() {
    ctx.clearRect(0, 0, width, height);

    // 1. 绘制雾气（最底层）
    fogParticles.forEach(f => {
        f.update();
        f.draw();
    });

    // 2. 旋转控制（第二页）
    if (appState === 'INTERACTIVE') {
        // 陀螺仪优先
        if (gyroAvailable) {
            // gamma: -90 ~ 90，映射到旋转速度
            targetRotationSpeed = (gyroGamma / 90) * 0.05;
        }
        currentRotationSpeed += (targetRotationSpeed - currentRotationSpeed) * 0.1;
        rotationY += currentRotationSpeed;
    }

    // 3. 绘制心形粒子
    heartParticles.forEach(p => {
        p.update();
        if (p.mode === '2D') p.draw2D();
        else p.draw3D();
    });

    // 指针移动状态衰减
    if (Date.now() - lastPointerTime > 100) {
        pointer.moving = false;
    }

    requestAnimationFrame(animate);
}

// =============================================
//  指针事件（鼠标 + 触摸统一处理）
// =============================================

function updatePointer(x, y, isActive) {
    pointer.x = x;
    pointer.y = y;
    pointer.moving = true;
    lastPointerTime = Date.now();
    if (isActive !== undefined) pointer.active = isActive;
}

// 鼠标
window.addEventListener('mousemove', e => {
    updatePointer(e.clientX, e.clientY);
    if (appState === 'LANDING') {
        pointer.active = true;
    } else if (appState === 'INTERACTIVE') {
        // 鼠标X位置直接控制旋转：屏幕中心=静止，偏左=逆时针，偏右=顺时针
        const normalizedX = (e.clientX / window.innerWidth - 0.5) * 2; // -1 ~ 1
        targetRotationSpeed = normalizedX * 0.04;
    }
});
window.addEventListener('mousedown', e => updatePointer(e.clientX, e.clientY, true));
window.addEventListener('mouseup', () => { pointer.active = false; });
window.addEventListener('mouseleave', () => { pointer.active = false; pointer.moving = false; });

// 触摸（Landing 页面吸引 + 第二页旋转）
window.addEventListener('touchstart', e => {
    const t = e.touches[0];
    updatePointer(t.clientX, t.clientY, true);
    touchStartX = t.clientX;
}, { passive: true });
window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    updatePointer(t.clientX, t.clientY, true);

    // 第二页：触摸位置控制旋转（与鼠标一致，基于X位置）
    if (appState === 'INTERACTIVE' && !gyroAvailable) {
        const normalizedX = (t.clientX / window.innerWidth - 0.5) * 2; // -1 ~ 1
        targetRotationSpeed = normalizedX * 0.04;
    }
}, { passive: true });
window.addEventListener('touchend', () => {
    pointer.active = false;
    // 松手后缓慢衰减旋转（不是突然停止）
    if (appState === 'INTERACTIVE' && !gyroAvailable) {
        targetRotationSpeed = 0.002;
    }
});

// =============================================
//  陀螺仪（手机倾斜控制旋转）
// =============================================

function initGyroscope() {
    // iOS 13+ 需要权限请求
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                    gyroAvailable = true;
                }
            })
            .catch(console.error);
    } else if ('DeviceOrientationEvent' in window) {
        // Android / 非 iOS
        window.addEventListener('deviceorientation', handleOrientation);
        // 检测是否真的有数据
        setTimeout(() => {
            if (!gyroAvailable) {
                // 没有陀螺仪数据，退回触摸/鼠标
                console.log('Gyroscope not available, using touch/mouse fallback');
            }
        }, 1000);
    }
}

function handleOrientation(event) {
    if (event.gamma !== null) {
        gyroAvailable = true;
        gyroGamma = event.gamma; // -90 ~ 90 左右倾斜
    }
}

// =============================================
//  页面交互逻辑
// =============================================

const startBtn = document.getElementById('start-btn');
const landingPage = document.getElementById('landing-page');
const nextScreen = document.getElementById('next-screen');
const bgMusic = document.getElementById('bg-music');
const playPauseBtn = document.getElementById('play-pause-btn');

// 切换到下一页
startBtn.addEventListener('click', () => {
    landingPage.classList.remove('visible-screen');
    landingPage.classList.add('hidden-screen');

    // 请求陀螺仪权限（Android 不需要，iOS 需要在用户手势中调用）
    initGyroscope();

    // ★ 关键：在用户手势回调内直接 play()，否则安卓浏览器会阻止
    bgMusic.volume = 0;
    bgMusic.play().then(() => {
        playPauseBtn.innerText = '⏸';
    }).catch(e => console.log('Audio play failed', e));

    setTimeout(() => {
        appState = 'INTERACTIVE';
        initHeartParticles('3D');

        // 背景切换为 #EFF0F1 渐变（Wonderful Tonight）
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #c8c9cc 0%, #EFF0F1 100%)';

        nextScreen.classList.remove('hidden-screen');
        nextScreen.classList.add('visible-screen');
        nextScreen.style.zIndex = 20;

        // 过渡完成后淡入音量
        bgMusic.volume = 0.5;

        // 更新交互提示
        updateHintText();
    }, 800);
});

// 根据设备更新提示文本
function updateHintText() {
    const hintEl = document.getElementById('interaction-hint');
    if (!hintEl) return;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        hintEl.innerHTML = '📱 Tilt your phone left & right<br>to rotate the hearts';
    } else {
        hintEl.innerHTML = '🖱️ Click & drag left/right<br>to rotate the hearts';
    }
}

// 音乐控制
playPauseBtn.addEventListener('click', () => {
    if (bgMusic.paused) {
        bgMusic.play();
        playPauseBtn.innerText = '⏸';
    } else {
        bgMusic.pause();
        playPauseBtn.innerText = '▶';
    }
});

// =============================================
//  界面 3: 第二首歌
// =============================================

const nextSongBtn = document.getElementById('next-song-btn');
const screen3 = document.getElementById('screen-3');
const bgMusic3 = document.getElementById('bg-music-3');
const playPauseBtn3 = document.getElementById('play-pause-btn-3');

nextSongBtn.addEventListener('click', () => {
    // 淡出界面 2
    nextScreen.classList.remove('visible-screen');
    nextScreen.classList.add('hidden-screen');

    // 停止第一首歌
    bgMusic.pause();

    setTimeout(() => {
        // 背景切换为克莱因蓝（沙滩）
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #001a5e 0%, #002FA7 100%)';

        // 重置粒子
        initHeartParticles('3D');

        // 显示界面 3
        screen3.classList.remove('hidden-screen');
        screen3.classList.add('visible-screen');
        screen3.style.zIndex = 20;

        // 播放第二首歌
        bgMusic3.volume = 0.5;
        bgMusic3.play().then(() => {
            playPauseBtn3.innerText = '⏸';
        }).catch(e => console.log('Audio play failed', e));
    }, 800);
});

// 界面 3 音乐控制
playPauseBtn3.addEventListener('click', () => {
    if (bgMusic3.paused) {
        bgMusic3.play();
        playPauseBtn3.innerText = '⏸';
    } else {
        bgMusic3.pause();
        playPauseBtn3.innerText = '▶';
    }
});

// =============================================
//  界面 J: Love Yourself (justin)
// =============================================

const nextSongBtn3 = document.getElementById('next-song-btn-3');
const screenJustin = document.getElementById('screen-justin');
const bgMusicJ = document.getElementById('bg-music-j');
const playPauseBtnJ = document.getElementById('play-pause-btn-j');

// 沙滩 → Justin
nextSongBtn3.addEventListener('click', () => {
    screen3.classList.remove('visible-screen');
    screen3.classList.add('hidden-screen');
    bgMusic3.pause();

    setTimeout(() => {
        // 背景切换为 #6D6D72 渐变（Love Yourself）
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #3d3d40 0%, #6D6D72 100%)';
        initHeartParticles('3D');

        screenJustin.classList.remove('hidden-screen');
        screenJustin.classList.add('visible-screen');
        screenJustin.style.zIndex = 20;

        bgMusicJ.volume = 0.5;
        bgMusicJ.play().then(() => {
            playPauseBtnJ.innerText = '⏸';
        }).catch(e => console.log('Audio play failed', e));
    }, 800);
});

// Justin 音乐控制
playPauseBtnJ.addEventListener('click', () => {
    if (bgMusicJ.paused) {
        bgMusicJ.play();
        playPauseBtnJ.innerText = '⏸';
    } else {
        bgMusicJ.pause();
        playPauseBtnJ.innerText = '▶';
    }
});

// =============================================
//  界面 4: 不要害怕 (wang)
// =============================================

const nextSongBtnJ = document.getElementById('next-song-btn-j');
const screen4 = document.getElementById('screen-4');
const bgMusic4 = document.getElementById('bg-music-4');
const playPauseBtn4 = document.getElementById('play-pause-btn-4');

// Justin → 不要害怕
nextSongBtnJ.addEventListener('click', () => {
    screenJustin.classList.remove('visible-screen');
    screenJustin.classList.add('hidden-screen');
    bgMusicJ.pause();

    setTimeout(() => {
        // 背景切换为 #A0BF52 渐变（不要害怕）
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #6b8a30 0%, #A0BF52 100%)';
        initHeartParticles('3D');

        screen4.classList.remove('hidden-screen');
        screen4.classList.add('visible-screen');
        screen4.style.zIndex = 20;

        bgMusic4.volume = 0.5;
        bgMusic4.play().then(() => {
            playPauseBtn4.innerText = '⏸';
        }).catch(e => console.log('Audio play failed', e));
    }, 800);
});

// 界面 4 音乐控制
playPauseBtn4.addEventListener('click', () => {
    if (bgMusic4.paused) {
        bgMusic4.play();
        playPauseBtn4.innerText = '⏸';
    } else {
        bgMusic4.pause();
        playPauseBtn4.innerText = '▶';
    }
});

// =============================================
//  返回按钮逻辑
// =============================================

// 界面2 → 返回主页
document.getElementById('back-btn-2').addEventListener('click', () => {
    nextScreen.classList.remove('visible-screen');
    nextScreen.classList.add('hidden-screen');
    bgMusic.pause();

    setTimeout(() => {
        appState = 'LANDING';
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #fad0c4 0%, #ffd1ff 100%)';
        initHeartParticles('2D');
        landingPage.classList.remove('hidden-screen');
        landingPage.classList.add('visible-screen');
    }, 800);
});

// 界面3 → 返回界面2
document.getElementById('back-btn-3').addEventListener('click', () => {
    screen3.classList.remove('visible-screen');
    screen3.classList.add('hidden-screen');
    bgMusic3.pause();

    setTimeout(() => {
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #c8c9cc 0%, #EFF0F1 100%)';
        initHeartParticles('3D');
        nextScreen.classList.remove('hidden-screen');
        nextScreen.classList.add('visible-screen');
        nextScreen.style.zIndex = 20;
        bgMusic.currentTime = 0;
        bgMusic.play().then(() => playPauseBtn.innerText = '⏸').catch(() => { });
    }, 800);
});

// 界面J → 返回界面3（沙滩）
document.getElementById('back-btn-j').addEventListener('click', () => {
    screenJustin.classList.remove('visible-screen');
    screenJustin.classList.add('hidden-screen');
    bgMusicJ.pause();

    setTimeout(() => {
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #001a5e 0%, #002FA7 100%)';
        initHeartParticles('3D');
        screen3.classList.remove('hidden-screen');
        screen3.classList.add('visible-screen');
        screen3.style.zIndex = 20;
        bgMusic3.currentTime = 0;
        bgMusic3.play().then(() => playPauseBtn3.innerText = '⏸').catch(() => { });
    }, 800);
});

// 界面4 → 返回界面J（Love Yourself）
document.getElementById('back-btn-4').addEventListener('click', () => {
    screen4.classList.remove('visible-screen');
    screen4.classList.add('hidden-screen');
    bgMusic4.pause();

    setTimeout(() => {
        document.querySelector('.bg-layer').style.background = 'linear-gradient(to top, #3d3d40 0%, #6D6D72 100%)';
        initHeartParticles('3D');
        screenJustin.classList.remove('hidden-screen');
        screenJustin.classList.add('visible-screen');
        screenJustin.style.zIndex = 20;
        bgMusicJ.currentTime = 0;
        bgMusicJ.play().then(() => playPauseBtnJ.innerText = '⏸').catch(() => { });
    }, 800);
});

// =============================================
//  初始化
// =============================================

initFog();
initHeartParticles('2D');
animate();
