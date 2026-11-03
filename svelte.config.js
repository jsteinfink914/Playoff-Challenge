import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-vercel installed cleanly and mirrors the League site's Vercel deploy.
		// runtime is pinned because the local build runs Node 24, which this adapter
		// version won't accept as an implicit default.
		// (adapter-node is the fallback if Vercel is ever dropped.)
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
