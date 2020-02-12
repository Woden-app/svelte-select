(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.Select = factory());
}(this, (function () { 'use strict';

    function noop() { }
    function is_promise(value) {
        return value && typeof value === 'object' && typeof value.then === 'function';
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function handle_promise(promise, info) {
        const token = info.token = {};
        function update(type, index, key, value) {
            if (info.token !== token)
                return;
            info.resolved = value;
            let child_ctx = info.ctx;
            if (key !== undefined) {
                child_ctx = child_ctx.slice();
                child_ctx[key] = value;
            }
            const block = type && (info.current = type)(child_ctx);
            let needs_flush = false;
            if (info.block) {
                if (info.blocks) {
                    info.blocks.forEach((block, i) => {
                        if (i !== index && block) {
                            group_outros();
                            transition_out(block, 1, 1, () => {
                                info.blocks[i] = null;
                            });
                            check_outros();
                        }
                    });
                }
                else {
                    info.block.d(1);
                }
                block.c();
                transition_in(block, 1);
                block.m(info.mount(), info.anchor);
                needs_flush = true;
            }
            info.block = block;
            if (info.blocks)
                info.blocks[index] = block;
            if (needs_flush) {
                flush();
            }
        }
        if (is_promise(promise)) {
            const current_component = get_current_component();
            promise.then(value => {
                set_current_component(current_component);
                update(info.then, 1, info.value, value);
                set_current_component(null);
            }, error => {
                set_current_component(current_component);
                update(info.catch, 2, info.error, error);
                set_current_component(null);
            });
            // if we previously had a then/catch block, destroy it
            if (info.current !== info.pending) {
                update(info.pending, 0);
                return true;
            }
        }
        else {
            if (info.current !== info.then) {
                update(info.then, 1, info.value, promise);
                return true;
            }
            info.resolved = promise;
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    var clickOutside = (node, event) => {
        const handleClick = e => {
            if (!(e.target === node || node.contains(e.target)))
                event();
        };

        document.body.addEventListener('click', handleClick);

        return {
            destroy() {
                document.body.removeEventListener('click', handleClick);
            }
        }
    };

    /* src/index.svelte generated by Svelte v3.18.2 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-hd19ij-style";
    	style.textContent = ".select.svelte-hd19ij{position:relative}input.svelte-hd19ij{border:1px solid #d2ddec;width:100%;padding:.5rem 1.9rem .5rem .75rem;display:inline-block;border-radius:.375rem;cursor:pointer;overflow:hidden;background:url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3e%3cpath fill='%23343a40' d='M2 0L0 2h4zm0 5L0 3h4z'/%3e%3c/svg%3e\") no-repeat right .75rem center/8px 10px}.container.svelte-hd19ij{position:absolute;width:100%;background-color:#fff;max-height:200px;z-index:4;border:1px solid rgba(0,0,0,.125);border-top:none;border-bottom-left-radius:.3rem;border-bottom-right-radius:.3rem}ul.svelte-hd19ij{padding:0;margin:0;list-style:none}li.svelte-hd19ij{padding:.3rem .6rem;cursor:pointer}li.selected.svelte-hd19ij{background-color:#f4f5f8}li.svelte-hd19ij:not(.unselectable):hover{background-color:#f4f5f8}#fade.svelte-hd19ij{position:absolute;width:100%;height:100%;cursor:pointer\n}";
    	append(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	return child_ctx;
    }

    // (143:4) {#if !isToggle}
    function create_if_block_2(ctx) {
    	let div;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "id", "fade");
    			attr(div, "class", "svelte-hd19ij");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			dispose = listen(div, "click", stop_propagation(/*click_handler*/ ctx[17]));
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			dispose();
    		}
    	};
    }

    // (171:4) {#if isToggle}
    function create_if_block(ctx) {
    	let div;
    	let ul;
    	let promise_1;

    	let info = {
    		ctx,
    		current: null,
    		token: null,
    		pending: create_pending_block,
    		then: create_then_block,
    		catch: create_catch_block,
    		value: 26
    	};

    	handle_promise(promise_1 = /*promise*/ ctx[6], info);

    	return {
    		c() {
    			div = element("div");
    			ul = element("ul");
    			info.block.c();
    			attr(ul, "class", "svelte-hd19ij");
    			attr(div, "class", "container svelte-hd19ij");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, ul);
    			info.block.m(ul, info.anchor = null);
    			info.mount = () => ul;
    			info.anchor = null;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			info.ctx = ctx;

    			if (dirty & /*promise*/ 64 && promise_1 !== (promise_1 = /*promise*/ ctx[6]) && handle_promise(promise_1, info)) ; else {
    				const child_ctx = ctx.slice();
    				child_ctx[26] = info.resolved;
    				info.block.p(child_ctx, dirty);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			info.block.d();
    			info.token = null;
    			info = null;
    		}
    	};
    }

    // (1:0) <script> import { createEventDispatcher }
    function create_catch_block(ctx) {
    	return { c: noop, m: noop, p: noop, d: noop };
    }

    // (178:12) {:then results}
    function create_then_block(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*results*/ ctx[26] && /*results*/ ctx[26].length > 0) return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (189:16) {:else}
    function create_else_block(ctx) {
    	let li;
    	let t_value = /*texts*/ ctx[0].noResult + "";
    	let t;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			t = text(t_value);
    			attr(li, "class", "unselectable svelte-hd19ij");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t);
    			dispose = listen(li, "click", /*click_handler_3*/ ctx[24]);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*texts*/ 1 && t_value !== (t_value = /*texts*/ ctx[0].noResult + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			dispose();
    		}
    	};
    }

    // (179:16) {#if results && results.length > 0}
    function create_if_block_1(ctx) {
    	let li;
    	let t0_value = /*texts*/ ctx[0].selectAll + "";
    	let t0;
    	let t1;
    	let each_1_anchor;
    	let dispose;
    	let each_value = /*results*/ ctx[26];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr(li, "class", "svelte-hd19ij");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			insert(target, t1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			dispose = listen(li, "click", /*click_handler_2*/ ctx[23]);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*texts*/ 1 && t0_value !== (t0_value = /*texts*/ ctx[0].selectAll + "")) set_data(t0, t0_value);

    			if (dirty & /*promise, selected, selectItem*/ 1104) {
    				each_value = /*results*/ ctx[26];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (detaching) detach(t1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    			dispose();
    		}
    	};
    }

    // (181:20) {#each results as result}
    function create_each_block(ctx) {
    	let li;
    	let t0_value = /*result*/ ctx[27].name + "";
    	let t0;
    	let t1;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(li, "class", "svelte-hd19ij");
    			toggle_class(li, "selected", /*result*/ ctx[27].id === /*selected*/ ctx[4]);
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);

    			dispose = listen(li, "click", function () {
    				if (is_function(/*selectItem*/ ctx[10](/*result*/ ctx[27]))) /*selectItem*/ ctx[10](/*result*/ ctx[27]).apply(this, arguments);
    			});
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*promise*/ 64 && t0_value !== (t0_value = /*result*/ ctx[27].name + "")) set_data(t0, t0_value);

    			if (dirty & /*promise, selected*/ 80) {
    				toggle_class(li, "selected", /*result*/ ctx[27].id === /*selected*/ ctx[4]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			dispose();
    		}
    	};
    }

    // (174:28)                  <li class="unselectable" on:click={() => input.focus()}
    function create_pending_block(ctx) {
    	let li;
    	let t_value = /*texts*/ ctx[0].searching + "";
    	let t;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			t = text(t_value);
    			attr(li, "class", "unselectable svelte-hd19ij");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t);
    			dispose = listen(li, "click", /*click_handler_1*/ ctx[22]);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*texts*/ 1 && t_value !== (t_value = /*texts*/ ctx[0].searching + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			dispose();
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let t0;
    	let input_1;
    	let t1;
    	let clickOutside_action;
    	let dispose;
    	let if_block0 = !/*isToggle*/ ctx[5] && create_if_block_2(ctx);
    	let if_block1 = /*isToggle*/ ctx[5] && create_if_block(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			input_1 = element("input");
    			t1 = space();
    			if (if_block1) if_block1.c();
    			attr(input_1, "id", /*id*/ ctx[3]);
    			attr(input_1, "type", "text");
    			attr(input_1, "placeholder", /*placeholder*/ ctx[1]);
    			input_1.disabled = /*disabled*/ ctx[2];
    			attr(input_1, "class", "svelte-hd19ij");
    			attr(div, "class", "select svelte-hd19ij");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, input_1);
    			/*input_1_binding*/ ctx[18](input_1);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);

    			dispose = [
    				listen(input_1, "focus", /*focus_handler*/ ctx[19]),
    				listen(input_1, "keydown", /*keydown_handler*/ ctx[20]),
    				listen(input_1, "input", /*input_handler*/ ctx[21]),
    				action_destroyer(clickOutside_action = clickOutside.call(null, div, /*clickOutside_function*/ ctx[25]))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (!/*isToggle*/ ctx[5]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*id*/ 8) {
    				attr(input_1, "id", /*id*/ ctx[3]);
    			}

    			if (dirty & /*placeholder*/ 2) {
    				attr(input_1, "placeholder", /*placeholder*/ ctx[1]);
    			}

    			if (dirty & /*disabled*/ 4) {
    				input_1.disabled = /*disabled*/ ctx[2];
    			}

    			if (/*isToggle*/ ctx[5]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (clickOutside_action && is_function(clickOutside_action.update) && dirty & /*isToggle*/ 32) clickOutside_action.update.call(null, /*clickOutside_function*/ ctx[25]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			/*input_1_binding*/ ctx[18](null);
    			if (if_block1) if_block1.d();
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { fetchInit } = $$props;
    	let { url } = $$props;
    	let { placeholder = "" } = $$props;
    	let { disabled } = $$props;
    	let { delay = 250 } = $$props;
    	let { id } = $$props;

    	let { texts = {
    		selectAll: "Tous",
    		searching: "Recherche en cours..",
    		noResult: "Aucun résultat à afficher"
    	} } = $$props;

    	// Prevent texts properties from being undefined
    	if (!texts.selectAll) texts.selectAll = "Tous";

    	if (!texts.searching) texts.searching = "Recherche en cours..";
    	if (!texts.noResult) texts.noResult = "Aucun résultat à afficher";
    	const dispatch = createEventDispatcher();
    	let selected;
    	let isToggle = false;
    	let isSearching = false;
    	let promise;
    	let input;

    	let init = {
    		method: "GET",
    		headers: { "Content-Type": "application/json" },
    		data: params => params,
    		processResults: results => results
    	};

    	// Compute fetch properties
    	Object.assign(init, fetchInit);

    	const toggle = () => {
    		if (disabled) return;
    		$$invalidate(5, isToggle = !isToggle);

    		// À l'ouverture du select on prefetch des résultats à afficher
    		if (isToggle) $$invalidate(6, promise = search(null, 0));
    	};

    	const search = (e, timeout = delay) => {
    		if (!isSearching) {
    			isSearching = true;

    			return new Promise(resolve => setTimeout(
    					async () => {
    						let endpoint = url;
    						let i = 0;

    						for (const [key, value] of Object.entries(init.data({ terms: e ? e.target.value : "" }))) if (value) {
    							endpoint += `${i === 0 ? "?" : "&"}${key}=${value}`;
    							i++;
    						}

    						try {
    							const res = await fetch(endpoint, init);
    							if (res.ok) resolve(init.processResults(await res.json())); else throw res;
    						} catch(err) {
    							input.blur();
    							dispatch("error", err);
    						} finally {
    							isSearching = false;
    						}
    					},
    					timeout
    				));
    		}
    	};

    	const selectItem = result => {
    		$$invalidate(4, selected = result ? result.id : null);
    		$$invalidate(5, isToggle = false);
    		$$invalidate(7, input.value = result ? result.name : texts.selectAll, input);
    		dispatch("selectItem", result);
    	};

    	const click_handler = () => {
    		toggle();
    		input.focus();
    	};

    	function input_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(7, input = $$value);
    		});
    	}

    	const focus_handler = () => {
    		if (!isToggle) toggle();
    	};

    	const keydown_handler = e => {
    		if (e.which === 27) {
    			$$invalidate(5, isToggle = false);
    			input.blur();
    		}
    	};

    	const input_handler = e => $$invalidate(6, promise = search(e));
    	const click_handler_1 = () => input.focus();
    	const click_handler_2 = () => selectItem(null);
    	const click_handler_3 = () => input.focus();

    	const clickOutside_function = () => {
    		if (isToggle) $$invalidate(5, isToggle = false);
    	};

    	$$self.$set = $$props => {
    		if ("fetchInit" in $$props) $$invalidate(11, fetchInit = $$props.fetchInit);
    		if ("url" in $$props) $$invalidate(12, url = $$props.url);
    		if ("placeholder" in $$props) $$invalidate(1, placeholder = $$props.placeholder);
    		if ("disabled" in $$props) $$invalidate(2, disabled = $$props.disabled);
    		if ("delay" in $$props) $$invalidate(13, delay = $$props.delay);
    		if ("id" in $$props) $$invalidate(3, id = $$props.id);
    		if ("texts" in $$props) $$invalidate(0, texts = $$props.texts);
    	};

    	return [
    		texts,
    		placeholder,
    		disabled,
    		id,
    		selected,
    		isToggle,
    		promise,
    		input,
    		toggle,
    		search,
    		selectItem,
    		fetchInit,
    		url,
    		delay,
    		isSearching,
    		dispatch,
    		init,
    		click_handler,
    		input_1_binding,
    		focus_handler,
    		keydown_handler,
    		input_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		clickOutside_function
    	];
    }

    class Src extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-hd19ij-style")) add_css();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			fetchInit: 11,
    			url: 12,
    			placeholder: 1,
    			disabled: 2,
    			delay: 13,
    			id: 3,
    			texts: 0
    		});
    	}
    }

    return Src;

})));
