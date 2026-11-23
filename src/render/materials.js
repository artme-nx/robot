// Materijali robota: proširenja MeshPhysicalMaterial-a s proceduralnim detaljima
// u object/world prostoru (MC mreže nemaju UV) i polirani krom.

import * as THREE from 'three';

export const NOISE_GLSL = /* glsl */ `
  float hash13( vec3 p3 ) {
    p3 = fract( p3 * 0.1031 );
    p3 += dot( p3, p3.zyx + 31.32 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }
  float vnoise( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n000 = hash13( i );
    float n100 = hash13( i + vec3( 1, 0, 0 ) );
    float n010 = hash13( i + vec3( 0, 1, 0 ) );
    float n110 = hash13( i + vec3( 1, 1, 0 ) );
    float n001 = hash13( i + vec3( 0, 0, 1 ) );
    float n101 = hash13( i + vec3( 1, 0, 1 ) );
    float n011 = hash13( i + vec3( 0, 1, 1 ) );
    float n111 = hash13( i + vec3( 1, 1, 1 ) );
    return mix( mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
                mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ), f.z );
  }
  float fbm3( vec3 p ) {
    float a = 0.5, s = 0.0;
    for ( int i = 0; i < 4; i ++ ) { s += a * vnoise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
  // Bump iz skalarne visine preko derivacija ekrana (Mikkelsen).
  vec3 bumpFromHeight( vec3 surfPos, vec3 surfNorm, float height, float scale ) {
    vec3 sx = dFdx( surfPos );
    vec3 sy = dFdy( surfPos );
    vec3 r1 = cross( sy, surfNorm );
    vec3 r2 = cross( surfNorm, sx );
    float det = dot( sx, r1 );
    float dhx = dFdx( height ) * scale;
    float dhy = dFdy( height ) * scale;
    vec3 grad = sign( det ) * ( dhx * r1 + dhy * r2 );
    return normalize( abs( det ) * surfNorm - grad );
  }
`;

/**
 * Proširi materijal kodom koji se umeće iza zadanih #include linija.
 * @param {THREE.Material} material
 * @param {{key:string, uniforms?:object, vertexPars?:string, vertexMain?:string,
 *          fragmentPars?:string, hooks?:Record<string,string>}} ext
 */
export function extendMaterial(material, ext) {
  const uniforms = ext.uniforms ?? {};
  material.userData.uniforms = uniforms;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        varying vec3 vWorldPos;
        ${ext.vertexPars ?? ''}`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vObjPos = position;
        vObjNormal = normal;
        vWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        ${ext.vertexMain ?? ''}`,
      );
    let fs = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vObjPos;
      varying vec3 vObjNormal;
      varying vec3 vWorldPos;
      ${NOISE_GLSL}
      ${ext.fragmentPars ?? ''}`,
    );
    for (const [chunk, code] of Object.entries(ext.hooks ?? {})) {
      const tag = `#include <${chunk}>`;
      if (!fs.includes(tag)) console.warn(`extendMaterial: nema ${tag}`);
      fs = fs.replace(tag, `${tag}\n${code}`);
    }
    shader.fragmentShader = fs;
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${ext.key}`;
  material.needsUpdate = true;
  return material;
}

/** Polirani krom. */
export function chromeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#cfd1d4',
    metalness: 1,
    roughness: 0.035,
    envMapIntensity: 1,
  });
}
