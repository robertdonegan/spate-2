/* GLSL. COMMON is shared by every fragment shader. */

export const COMMON = `
vec3 tonemap(vec3 c){
  c = max(c, 0.0);
  c = (c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14);
  return pow(clamp(c,0.0,1.0), vec3(0.4545));
}
float hash21(vec2 p){
  p = fract(p*vec2(123.34,456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0)), d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}`;

export const SKY_VS = `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}`;
export const SKY_FS = `
precision highp float;
${COMMON}
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uBottom, uSunDir;
uniform float uStorm;
void main(){
  vec3 d = normalize(vDir);
  vec3 top = mix(uTop, vec3(0.055,0.072,0.086), uStorm);
  vec3 hor = mix(uHorizon, vec3(0.112,0.130,0.140), uStorm);
  float t = d.y;
  vec3 c = t > 0.0 ? mix(hor, top, pow(t, 0.55)) : mix(hor, uBottom, pow(-t, 0.5));
  float cl = vnoise(d.xz/max(abs(d.y),0.12)*1.6);
  c = mix(c, c*1.24, smoothstep(0.35,0.9,cl)*max(t,0.0)*(0.32+0.48*uStorm));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  float clear = 1.0 - uStorm;
  c += vec3(1.0,0.86,0.68)*pow(s,220.0)*1.4*clear;
  c += vec3(1.0,0.80,0.60)*pow(s,7.0)*0.10*clear;
  gl_FragColor = vec4(tonemap(c), 1.0);
}`;

export const TERRAIN_VS = `
attribute vec3 aCol;
attribute float aAO;
attribute float aWet;
attribute vec3 aNrm;
varying vec3 vCol; varying vec3 vW; varying float vY; varying float vAO; varying float vWet; varying vec3 vN;
void main(){
  vCol = aCol; vY = position.y; vAO = aAO; vWet = aWet; vN = aNrm;
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const TERRAIN_FS = `
precision highp float;
${COMMON}
varying vec3 vCol; varying vec3 vW; varying float vY; varying float vAO; varying float vWet; varying vec3 vN;
uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uCam;
uniform float uContour, uContourOn, uStorm;
void main(){
  vec3 nrm = normalize(vN);
  if(nrm.y < 0.0) nrm = -nrm;
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCam - vW);

  float key = max(dot(nrm, L), 0.0);
  float bounce = max(dot(nrm, normalize(vec3(-L.x, 0.25, -L.z))), 0.0);
  vec3 hemi = mix(uGroundCol, uSkyCol, nrm.y*0.5 + 0.5);

  vec3 alb = vCol;
  alb *= 0.90 + 0.20*vnoise(vW.xz*0.55);
  alb *= 0.95 + 0.10*vnoise(vW.xz*3.10);
  alb = mix(alb, alb*0.54, vWet);

  vec3 c = alb * (hemi*(0.62 - 0.16*uStorm) + uSunCol*key*(1.05 - 0.62*uStorm) + uGroundCol*bounce*0.20);
  c *= mix(1.0, vAO, 0.85);
  float rim = pow(1.0 - max(dot(nrm, V), 0.0), 3.5);
  c += uSkyCol * rim * 0.10;

  float f = vY / uContour;
  float d1 = fwidth(f);
  float minor = 1.0 - smoothstep(0.0, d1*1.1, abs(fract(f+0.5)-0.5));
  minor *= 1.0 - smoothstep(0.22, 0.60, d1);
  float fm = vY / (uContour*5.0);
  float d2 = fwidth(fm);
  float major = 1.0 - smoothstep(0.0, d2*1.1, abs(fract(fm+0.5)-0.5));
  major *= 1.0 - smoothstep(0.22, 0.60, d2);
  c = mix(c, vec3(0.80,0.66,0.20), clamp(minor*0.10 + major*0.22, 0.0, 0.32)*uContourOn);

  gl_FragColor = vec4(tonemap(c), 1.0);
}`;

export const SKIRT_VS = `
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const SKIRT_FS = `
precision highp float;
${COMMON}
varying vec3 vW;
uniform vec3 uSunDir, uSunCol;
uniform float uBase, uSpan;
void main(){
  vec3 nrm = normalize(cross(dFdx(vW), dFdy(vW)));
  float t = clamp((vW.y - uBase) / uSpan, 0.0, 1.0);
  float band = 0.5 + 0.5*sin(vW.y*3.4 + vnoise(vW.xz*0.10)*4.5);
  float grit = vnoise(vW.xz*1.6 + vW.y*0.9);
  vec3 c = mix(vec3(0.185,0.150,0.120), vec3(0.520,0.420,0.300), pow(t, 0.75));
  c *= 0.87 + 0.20*band;
  c *= 0.93 + 0.14*grit;
  float key = abs(dot(nrm, normalize(uSunDir)));
  c *= 0.52 + 0.62*key;
  c = mix(c, vec3(0.28,0.30,0.20), smoothstep(0.94, 1.0, t)*0.55);
  gl_FragColor = vec4(tonemap(c), 1.0);
}`;

export const POST_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const POST_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uAmount, uFocus, uBand, uVignette, uSat;
uniform int uFinal;
void main(){
  float d = abs(vUv.y - uFocus);
  float m = smoothstep(uBand*0.5, uBand*0.5 + 0.30, d);
  float r = m*m*uAmount;
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for(int k = -6; k <= 6; k++){
    float fk = float(k);
    float w = exp(-fk*fk/16.0);
    vec2 uv = clamp(vUv + uTexel*fk*r, vec2(0.0), vec2(1.0));
    sum += texture2D(uTex, uv).rgb * w;
    wsum += w;
  }
  vec3 c = sum / wsum;
  if(uFinal == 1){
    float l = dot(c, vec3(0.299,0.587,0.114));
    c = mix(vec3(l), c, uSat);
    vec2 dd = vUv - 0.5;
    c *= 1.0 - uVignette*dot(dd,dd)*1.4;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export const WATER_VS = `
attribute float aDepth;
attribute float aVel;
attribute vec3 aNrm;
varying float vD; varying float vV; varying vec3 vW; varying vec3 vN;
void main(){
  vD = aDepth; vV = aVel; vN = aNrm;
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const WATER_FS = `
precision highp float;
${COMMON}
varying float vD; varying float vV; varying vec3 vW; varying vec3 vN;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform vec3 uSunDir, uSunCol, uSkyCol, uCam, uExt, uTint;
uniform float uTime, uRain, uDScale, uVScale, uStorm;
uniform int uMode;

vec3 depthRamp(float t){
  vec3 a = vec3(0.62,0.90,0.93), b = vec3(0.18,0.60,0.78), c = vec3(0.05,0.20,0.42);
  return t < 0.5 ? mix(a,b,t*2.0) : mix(b,c,(t-0.5)*2.0);
}
vec3 velRamp(float t){
  vec3 a = vec3(0.24,0.50,0.58), b = vec3(0.91,0.52,0.23), c = vec3(0.96,0.92,0.74);
  return t < 0.6 ? mix(a,b,t/0.6) : mix(b,c,(t-0.6)/0.4);
}
vec3 hazardBand(float hr){
  if(hr < 0.75) return vec3(0.38,0.70,0.52);
  if(hr < 1.25) return vec3(0.90,0.80,0.29);
  if(hr < 2.50) return vec3(0.91,0.52,0.18);
  return vec3(0.84,0.25,0.22);
}

void main(){
  float edge = smoothstep(0.0015, 0.045, vD);
  if(edge <= 0.002) discard;

  vec3 gn = normalize(vN);
  if(gn.y < 0.0) gn = -gn;

  float rip = 0.34 + 0.66*clamp(uRain/40.0, 0.0, 1.0) + clamp(vV*0.35, 0.0, 0.5);
  float s1 = sin(vW.x*2.9 + uTime*2.2) * cos(vW.z*3.3 - uTime*1.7);
  float s2 = sin(vW.x*7.7 - uTime*3.9 + vW.z*5.1);
  float s3 = vnoise(vW.xz*4.5 + uTime*0.55) - 0.5;
  vec3 nrm = normalize(gn + vec3(s1*0.055 + s3*0.10, 0.0, s2*0.045 + s3*0.10) * rip);

  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCam - vW);
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(nrm, V), 0.0), 4.5);
  float spec = pow(max(dot(reflect(-L, nrm), V), 0.0), 96.0);
  float wide = pow(max(dot(reflect(-L, nrm), V), 0.0), 12.0);



  vec3 col; float alpha;
  if(uMode == 0){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 off = nrm.xz * (0.030 * clamp(vD*4.0, 0.05, 1.0));
    vec3 bed = texture2D(uScene, clamp(uv + off, vec2(0.001), vec2(0.999))).rgb;
    vec3 absorb = exp(-vD * 1.7 * uExt);
    col = bed*absorb + uTint*(1.0 - absorb)*(0.55 + 0.45*max(dot(nrm,L),0.0));
    col = mix(col, uSkyCol*(1.0 - 0.45*uStorm), fres*0.55);
    col += uSunCol*spec*0.85 + uSunCol*wide*0.06;
    alpha = edge;
  } else {
    if(uMode == 1) col = depthRamp(clamp(vD/uDScale, 0.0, 1.0));
    else if(uMode == 2) col = velRamp(clamp(vV/uVScale, 0.0, 1.0));
    else if(uMode == 3) col = hazardBand(vD*(vV + 0.5));
    else col = mix(vec3(0.50,0.43,0.26), vec3(0.93,0.63,0.24), clamp(vD/uDScale, 0.0, 1.0));
    col *= 0.60 + 0.55*max(dot(nrm, L), 0.0);
    col += uSunCol*spec*0.35;
    alpha = (uMode == 4 ? 0.74 : 0.90) * edge;
  }
  gl_FragColor = vec4(tonemap(col), alpha);
}`;

export const RAIN_VS = `
attribute vec2 aCorner;
attribute float aRnd;
varying vec2 vC; varying float vOn;
uniform float uTime, uH, uFrac, uLen, uWid;
uniform vec3 uRight;
void main(){
  vOn = step(aRnd, uFrac);
  float sp = 15.0 + aRnd*12.0;
  float y = mod(position.y - uTime*sp, uH);
  vec3 p = vec3(position.x, y, position.z);
  p += uRight*aCorner.x*uWid + vec3(0.0,1.0,0.0)*aCorner.y*uLen*(0.6+0.8*aRnd);
  vC = aCorner;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if(vOn < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
export const RAIN_FS = `
precision highp float;
varying vec2 vC; varying float vOn;
uniform vec3 uCol; uniform float uOpacity;
void main(){
  float a = (1.0 - abs(vC.x));
  a *= 0.25 + 0.75*(0.5 + 0.5*vC.y);
  gl_FragColor = vec4(uCol, a*uOpacity);
}`;

/* ------------------------------------------------------------- UI atoms */

export const VEG_VS = `
attribute vec3 aNrm; attribute vec3 aCol; attribute float aSway;
varying vec3 vN; varying vec3 vC; varying vec3 vW;
uniform float uTime;
void main(){
  vN = aNrm; vC = aCol;
  vec3 p = position;
  float ph = p.x*0.21 + p.z*0.17;
  p.x += sin(uTime*1.15 + ph)*aSway*0.34;
  p.z += cos(uTime*0.93 + ph*1.3)*aSway*0.26;
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
}`;
export const VEG_FS = `
precision highp float;
${COMMON}
varying vec3 vN; varying vec3 vC; varying vec3 vW;
uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol;
uniform float uStorm;
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(uSunDir);
  float key = max(dot(n,L), 0.0);
  vec3 hemi = mix(uGroundCol, uSkyCol, n.y*0.5+0.5);
  vec3 c = vC * (hemi*(0.70 - 0.18*uStorm) + uSunCol*key*(0.95 - 0.55*uStorm));
  gl_FragColor = vec4(tonemap(c), 1.0);
}`;

export const STREAK_VS = `
attribute float aAlpha; attribute float aSpd;
varying float vA; varying float vS;
void main(){
  vA = aAlpha; vS = aSpd;
  gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0);
}`;
export const STREAK_FS = `
precision highp float;
${COMMON}
varying float vA; varying float vS;
uniform vec3 uR0, uR1, uR2, uR3;
uniform float uVScale, uOpacity;
void main(){
  if(vA <= 0.01) discard;
  float t = clamp(vS/uVScale, 0.0, 1.0) * 3.0;
  vec3 c = t < 1.0 ? mix(uR0,uR1,t) : (t < 2.0 ? mix(uR1,uR2,t-1.0) : mix(uR2,uR3,t-2.0));
  gl_FragColor = vec4(tonemap(c), vA*uOpacity);
}`;

export const FLOAT_VS = `
attribute vec3 aTint; attribute float aStuck;
varying vec3 vT; varying float vStuck;
uniform float uSize, uProj;
void main(){
  vT = aTint; vStuck = aStuck;
  vec4 mv = viewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(4.0, uSize * uProj / max(-mv.z, 1.0));
}`;
export const FLOAT_FS = `
precision highp float;
${COMMON}
varying vec3 vT; varying float vStuck;
uniform int uShape;
void main(){
  vec2 uv = gl_PointCoord*2.0 - 1.0;
  uv.y = -uv.y;
  vec2 bc = vec2(0.0,-0.18); float br = 0.76;
  float dB = length(uv-bc) - br;
  vec3 base = vT; vec2 lp = (uv-bc)/br;
  if(uShape == 1){
    vec2 hc = vec2(0.30, 0.52); float hr = 0.36;
    float dH = length(uv-hc) - hr;
    vec2 beak = uv - vec2(0.60, 0.46);
    float dK = max(abs(beak.y)*2.6 + beak.x - 0.16, -beak.x - 0.10);
    if(dH < dB && dH < dK){ lp = (uv-hc)/hr; base = vT*1.10; }
    else if(dK < dB){ lp = beak*3.0; base = vec3(0.95,0.60,0.16); }
    float d = min(min(dB,dH),dK);
    if(d > 0.30) discard;
    if(d > 0.0){
      gl_FragColor = vec4(tonemap(vT*2.0), exp(-d*11.0)*0.62*(1.0 - vStuck*0.7));
      return;
    }
  } else {
    if(dB > 0.30) discard;
    if(dB > 0.0){
      gl_FragColor = vec4(tonemap(vT*2.0), exp(-dB*11.0)*0.62*(1.0 - vStuck*0.7));
      return;
    }
  }
  float r2 = clamp(dot(lp,lp), 0.0, 1.0);
  vec3 n = normalize(vec3(lp, sqrt(1.0 - r2) + 0.15));
  vec3 L = normalize(vec3(-0.42, 0.55, 0.72));
  float key = max(dot(n,L), 0.0);
  float spec = pow(key, 26.0);
  vec3 c = base*(0.55 + 0.70*key) + base*0.40 + vec3(1.0)*spec*0.50;
  float rim = smoothstep(0.80, 1.0, sqrt(r2));
  c = mix(c, c*0.18, rim*0.75);
  c = mix(c, c*0.42, vStuck*0.65);
  gl_FragColor = vec4(tonemap(c), 1.0);
}`;
