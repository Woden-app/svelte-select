import pkg from './package.json'
import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';

const name = pkg.name
	.replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
	.replace(/^\w/, m => m.toUpperCase())
	.replace(/-\w/g, m => m[1].toUpperCase())

export default {
    input: 'src/index.svelte',
    output: [
        // {
        //     file: `lib/${pkg.module}`,
        //     format: 'es'
        // },
        {
            file: `lib/${pkg.main}`,
            format: 'umd',
            name
        }
    ],
    plugins: [
        svelte(),
        resolve()
    ]
}