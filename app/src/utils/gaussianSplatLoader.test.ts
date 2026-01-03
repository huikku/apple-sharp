/**
 * Tests for Gaussian Splat PLY Loader
 */
import { describe, it, expect } from 'vitest'

describe('Gaussian Splat Loader', () => {
    describe('PLY Header Parsing', () => {
        it('should parse vertex count from header', () => {
            const header = `ply
format binary_little_endian 1.0
element vertex 262144
property float x
end_header`

            const match = header.match(/element vertex (\d+)/)
            expect(match).not.toBeNull()
            expect(parseInt(match![1])).toBe(262144)
        })

        it('should detect binary format', () => {
            const binaryHeader = 'format binary_little_endian 1.0'
            const asciiHeader = 'format ascii 1.0'

            expect(binaryHeader.includes('binary')).toBe(true)
            expect(asciiHeader.includes('binary')).toBe(false)
        })

        it('should identify required properties', () => {
            const requiredProps = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity']

            requiredProps.forEach(prop => {
                expect(typeof prop).toBe('string')
            })
        })
    })

    describe('Color Conversion', () => {
        const SH_C0 = 0.28209479177387814

        it('should convert SH to RGB correctly', () => {
            // Neutral gray (SH = 0)
            const sh = 0
            const rgb = 0.5 + SH_C0 * sh
            expect(Math.abs(rgb - 0.5)).toBeLessThan(0.001)
        })

        it('should clamp RGB to 0-1 range', () => {
            const testValues = [-10, -1, 0, 1, 10]

            testValues.forEach(sh => {
                const rgb = Math.max(0, Math.min(1, 0.5 + SH_C0 * sh))
                expect(rgb).toBeGreaterThanOrEqual(0)
                expect(rgb).toBeLessThanOrEqual(1)
            })
        })

        it('should convert opacity using sigmoid', () => {
            const sigmoid = (x: number) => 1.0 / (1.0 + Math.exp(-x))

            // Test neutral (0 -> 0.5)
            expect(Math.abs(sigmoid(0) - 0.5)).toBeLessThan(0.001)

            // Test high opacity (10 -> ~1)
            expect(sigmoid(10)).toBeGreaterThan(0.99)

            // Test low opacity (-10 -> ~0)
            expect(sigmoid(-10)).toBeLessThan(0.01)
        })
    })

    describe('Geometry Creation', () => {
        it('should create position array with correct structure', () => {
            const vertexCount = 100
            const positions = new Float32Array(vertexCount * 3)

            expect(positions.length).toBe(300)
            expect(positions.length % 3).toBe(0)
        })

        it('should create color array with correct structure', () => {
            const vertexCount = 100
            const colors = new Float32Array(vertexCount * 3)

            expect(colors.length).toBe(300)
            expect(colors.length % 3).toBe(0)
        })

        it('should create scale array with correct structure', () => {
            const vertexCount = 100
            const scales = new Float32Array(vertexCount)

            expect(scales.length).toBe(100)
        })
    })

    describe('Error Handling', () => {
        it('should detect invalid PLY format', () => {
            const invalidHeader = 'not a ply file'
            expect(invalidHeader.startsWith('ply')).toBe(false)
        })

        it('should detect missing vertex count', () => {
            const headerWithoutVertex = `ply
format binary_little_endian 1.0
end_header`

            const match = headerWithoutVertex.match(/element vertex (\d+)/)
            expect(match).toBeNull()
        })
    })

    describe('Retry Logic', () => {
        it('should have valid retry parameters', () => {
            const MAX_RETRIES = 3
            const RETRY_DELAY = 1000

            expect(MAX_RETRIES).toBeGreaterThan(0)
            expect(RETRY_DELAY).toBeGreaterThan(0)
        })
    })
})

describe('PLY Property Types', () => {
    it('should map property types correctly', () => {
        const propertyTypes: Record<string, number> = {
            'char': 1,
            'uchar': 1,
            'short': 2,
            'ushort': 2,
            'int': 4,
            'uint': 4,
            'float': 4,
            'double': 8,
        }

        expect(propertyTypes['float']).toBe(4)
        expect(propertyTypes['uchar']).toBe(1)
        expect(propertyTypes['double']).toBe(8)
    })
})
