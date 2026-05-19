<?php
/**
 * Plugin Name: SkarpeKniver — Discount Rules REST
 * Description: Eksponerer wp_wdp_discounts (Studio Wombat WC Discounts plugin)
 *              som /wp-json/skn/v1/discount-rules. Brukes av Next.js
 *              frontend-cronen til å speile regler til Supabase.
 *
 * Du kan enten:
 *   A) lime hele blokken under <?php-headeren inn i chef-mu-pluginen din
 *      (slett <?php-headeren — den filen har sin egen), eller
 *   B) lagre denne fila som wp-content/mu-plugins/skn-discount-rules-rest.php
 *      (den auto-aktiveres).
 *
 * Endepunktet returnerer kun MVP-feltene vi trenger på frontend:
 *   - id, enabled, type, name
 *   - tiers: [{ starting_quantity, discount_pct }]
 *   - count_mode: 'combined' | 'per-product'
 *   - apply_to: { product_ids, skus, category_slugs, tag_slugs }
 *   - start_date, end_date
 *
 * Plugin'ens rå `settings`-JSON returneres også som `_raw_settings` så vi
 * kan diff-debugge hvis evaluator viser feil rabatt vs. plugin selv.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'rest_api_init', function () {
    register_rest_route( 'skn/v1', '/discount-rules', [
        'methods'             => 'GET',
        'callback'            => 'skn_get_discount_rules',
        'permission_callback' => 'skn_discount_rules_permission',
    ] );
} );

/**
 * Kun WC-API-klienter (ck_/cs_-keys med manage_woocommerce-cap) kan lese
 * regler. Vi vil ikke eksponere kommende kampanjer på offentlig API.
 */
function skn_discount_rules_permission() {
    return current_user_can( 'manage_woocommerce' );
}

function skn_get_discount_rules( WP_REST_Request $request ) {
    global $wpdb;
    $table = $wpdb->prefix . 'wdp_discounts';

    // Sjekk om tabellen finnes — pluginen kan være avinstallert.
    $exists = $wpdb->get_var( $wpdb->prepare(
        "SHOW TABLES LIKE %s", $table
    ) );
    if ( ! $exists ) {
        return new WP_REST_Response( [], 200 );
    }

    $rows = $wpdb->get_results( "SELECT * FROM {$table} WHERE enabled = 1 ORDER BY sort ASC", ARRAY_A );
    $out  = [];

    foreach ( $rows as $row ) {
        $settings_raw = $row['settings'];
        $settings     = is_string( $settings_raw ) ? json_decode( $settings_raw, true ) : null;
        if ( ! is_array( $settings ) ) {
            $settings = [];
        }

        $apply_to = skn_normalize_apply_to( $settings );
        $tiers    = skn_normalize_tiers( $settings, $row['type'] );
        $count    = skn_normalize_count_mode( $settings );

        $out[] = [
            'id'            => (int) $row['id'],
            'enabled'       => (bool) $row['enabled'],
            'type'          => (string) $row['type'],
            'name'          => (string) $row['name'],
            'tiers'         => $tiers,
            'count_mode'    => $count,
            'apply_to'      => $apply_to,
            'start_date'    => $row['start_date'] ?: null,
            'end_date'      => $row['end_date'] ?: null,
            '_raw_settings' => $settings,
        ];
    }

    return new WP_REST_Response( $out, 200 );
}

/**
 * Plugin'ens "selected products"-konfigurasjon kan inneholde flere
 * filter-grupper koblet med OR. For MVP kollapser vi til fire flate lister:
 * product_ids, skus, category_slugs, tag_slugs. Et produkt er eligible hvis
 * det matcher MINST én av listene (OR-semantikk på frontend-siden).
 *
 * Studio Wombat-plugin'en bruker ulike nøkler avhengig av versjon. Vi
 * defensivt sjekker både `filters` (gruppert) og `included_products` (flat).
 */
function skn_normalize_apply_to( array $settings ) {
    $product_ids    = [];
    $skus           = [];
    $category_slugs = [];
    $tag_slugs      = [];

    // "Apply to all products in store" = ingen filter, alt eligible.
    $apply_to_all = ! empty( $settings['apply_to_all'] ) || ! empty( $settings['all_products'] );
    if ( $apply_to_all ) {
        return [
            'all'            => true,
            'product_ids'    => [],
            'skus'           => [],
            'category_slugs' => [],
            'tag_slugs'      => [],
        ];
    }

    // Gruppert filter-format (versjoner vi har sett i v1.2.x).
    if ( ! empty( $settings['filters'] ) && is_array( $settings['filters'] ) ) {
        foreach ( $settings['filters'] as $group ) {
            if ( ! is_array( $group ) ) continue;
            foreach ( $group as $filter ) {
                if ( ! is_array( $filter ) ) continue;
                $key   = $filter['filter']  ?? '';
                $is    = ( $filter['is']    ?? 'in' ) === 'in';
                $value = $filter['value']   ?? [];
                if ( ! $is ) continue; // hopper over "is not"-filter for MVP
                if ( ! is_array( $value ) ) $value = [ $value ];

                if ( $key === 'products' ) {
                    foreach ( $value as $v ) $product_ids[] = (int) $v;
                } elseif ( $key === 'cats' || $key === 'categories' ) {
                    foreach ( $value as $v ) {
                        $term = get_term( (int) $v, 'product_cat' );
                        if ( $term && ! is_wp_error( $term ) ) $category_slugs[] = $term->slug;
                    }
                } elseif ( $key === 'tags' ) {
                    foreach ( $value as $v ) {
                        $term = get_term( (int) $v, 'product_tag' );
                        if ( $term && ! is_wp_error( $term ) ) $tag_slugs[] = $term->slug;
                    }
                } elseif ( $key === 'sku' || $key === 'skus' ) {
                    foreach ( $value as $v ) $skus[] = (string) $v;
                }
            }
        }
    }

    // Flat fallback — eldre plugin-versjoner.
    if ( ! empty( $settings['included_products'] ) && is_array( $settings['included_products'] ) ) {
        foreach ( $settings['included_products'] as $v ) $product_ids[] = (int) $v;
    }

    return [
        'all'            => false,
        'product_ids'    => array_values( array_unique( $product_ids ) ),
        'skus'           => array_values( array_unique( $skus ) ),
        'category_slugs' => array_values( array_unique( $category_slugs ) ),
        'tag_slugs'      => array_values( array_unique( $tag_slugs ) ),
    ];
}

/**
 * Bulk-rules har en `tiers`-array i settings. Hver tier har minst
 * `starting_quantity` og enten `discount_pct` (prosent) eller `unit_price`
 * (fast pris). Vi støtter kun prosent for MVP.
 */
function skn_normalize_tiers( array $settings, $type ) {
    if ( $type !== 'bulk' ) {
        return [];
    }

    $tiers_raw = $settings['tiers'] ?? [];
    if ( ! is_array( $tiers_raw ) ) {
        return [];
    }

    $tiers = [];
    foreach ( $tiers_raw as $tier ) {
        if ( ! is_array( $tier ) ) continue;
        $qty = (int) ( $tier['quantity'] ?? $tier['starting_quantity'] ?? 0 );
        if ( $qty <= 0 ) continue;
        $pct = $tier['discount']        ?? $tier['discount_pct']  ?? null;
        $sub = $tier['discount_subtype'] ?? $tier['type']         ?? 'percentage';
        if ( $pct === null || $sub !== 'percentage' ) {
            // Ikke-prosent tier (fast pris/fast avslag). Hopp over for MVP.
            continue;
        }
        $tiers[] = [
            'starting_quantity' => $qty,
            'discount_pct'      => (float) $pct,
        ];
    }

    // Sorter stigende på qty så evaluator kan finne høyeste matchende tier.
    usort( $tiers, function( $a, $b ) {
        return $a['starting_quantity'] - $b['starting_quantity'];
    } );

    return $tiers;
}

function skn_normalize_count_mode( array $settings ) {
    $mode = $settings['count_mode'] ?? 'combined';
    return $mode === 'per_product' || $mode === 'per-product' ? 'per-product' : 'combined';
}
