<?php
/**
 * Plugin Name: SkarpeKniver — Category Mega Menu Editorial Meta
 * Description: Eksponerer mega-meny editorial-felt på product_cat-taksonomien.
 *              Hovedartikkel (skn_mega_post_id) + 0–2 knapper (label/url) per
 *              kategori. Frontend (Next.js) leser disse via wc/v3-API og
 *              bygger mega-menyens redaksjonelle innhold.
 *
 * Plassering: lim inn i chef-mu-pluginen ELLER lagre som mu-plugin:
 *   wp-content/mu-plugins/skn-category-mega-editorial.php
 *
 * Bruk i WP-admin:
 *   Produkter → Kategorier → Rediger en kategori → "Mega-meny editorial"
 *
 * Felter:
 *   - Mega menu post ID    — WP post-ID for hovedartikkelen
 *   - Knapp 1: label + url
 *   - Knapp 2: label + url
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * 1) Registrer term-meta så feltene eksponeres i WP REST under term['meta'].
 */
add_action( 'init', function () {
    $auth = function () {
        return current_user_can( 'manage_product_terms' )
            || current_user_can( 'edit_terms', 'product_cat' )
            || current_user_can( 'manage_options' );
    };

    $string_meta = function ( $description ) use ( $auth ) {
        return [
            'type'          => 'string',
            'description'   => $description,
            'single'        => true,
            'show_in_rest'  => true,
            'auth_callback' => $auth,
        ];
    };

    register_term_meta( 'product_cat', 'skn_mega_post_id',        $string_meta( 'WP post-ID for mega-meny hovedartikkel.' ) );
    register_term_meta( 'product_cat', 'skn_mega_button_1_label', $string_meta( 'Mega-meny knapp 1 — label.' ) );
    register_term_meta( 'product_cat', 'skn_mega_button_1_url',   $string_meta( 'Mega-meny knapp 1 — URL.' ) );
    register_term_meta( 'product_cat', 'skn_mega_button_2_label', $string_meta( 'Mega-meny knapp 2 — label.' ) );
    register_term_meta( 'product_cat', 'skn_mega_button_2_url',   $string_meta( 'Mega-meny knapp 2 — URL.' ) );
} );

/**
 * 2) Eksponér feltene i meta_data-array på /wc/v3/products/categories slik at
 *    Next.js-frontenden plukker dem opp i samme mønster som skn_section_tags.
 *
 *    NB: hvis register_rest_field('product_cat', 'meta_data') allerede er
 *    registrert et annet sted (f.eks. for skn_section_tags eller
 *    skn_default_upsell_product_id), må DEN callback-funksjonen utvides til
 *    å også returnere skn_mega_*-nøklene. Hopper over for å unngå konflikt.
 */
add_action( 'rest_api_init', function () {
    global $wp_rest_additional_fields;
    if ( isset( $wp_rest_additional_fields['product_cat']['meta_data'] ) ) {
        return;
    }

    register_rest_field( 'product_cat', 'meta_data', [
        'get_callback' => function ( $term ) {
            $keys = [
                'skn_section_tags',
                'skn_default_upsell_product_id',
                'skn_mega_post_id',
                'skn_mega_button_1_label',
                'skn_mega_button_1_url',
                'skn_mega_button_2_label',
                'skn_mega_button_2_url',
            ];
            $out = [];
            foreach ( $keys as $key ) {
                $value = get_term_meta( $term['id'], $key, true );
                if ( $value !== '' && $value !== null && $value !== false ) {
                    $out[] = [ 'key' => $key, 'value' => $value ];
                }
            }
            return $out;
        },
        'schema' => [
            'description' => 'Term meta exposed for headless frontend.',
            'type'        => 'array',
        ],
    ] );
} );

/**
 * 3) Admin-UI: input-felter på "Edit category"-skjermen.
 */
add_action( 'product_cat_edit_form_fields', function ( $term ) {
    $post_id        = get_term_meta( $term->term_id, 'skn_mega_post_id', true );
    $btn1_label     = get_term_meta( $term->term_id, 'skn_mega_button_1_label', true );
    $btn1_url       = get_term_meta( $term->term_id, 'skn_mega_button_1_url', true );
    $btn2_label     = get_term_meta( $term->term_id, 'skn_mega_button_2_label', true );
    $btn2_url       = get_term_meta( $term->term_id, 'skn_mega_button_2_url', true );
    ?>
    <tr class="form-field term-skn-mega-section-wrap">
        <th scope="row" colspan="2">
            <h2 style="margin: 1em 0 0; padding-top: 1em; border-top: 1px solid #ddd;">
                Mega-meny editorial
            </h2>
            <p class="description" style="font-weight: normal;">
                Innhold som vises i hoved-mega-menyen for denne kategorien.
                La feltene stå tomme for å bruke hardkodet default fra koden.
            </p>
        </th>
    </tr>

    <tr class="form-field term-skn-mega-post-id-wrap">
        <th scope="row">
            <label for="skn_mega_post_id">Hovedartikkel — post-ID</label>
        </th>
        <td>
            <input
                type="text"
                name="skn_mega_post_id"
                id="skn_mega_post_id"
                value="<?php echo esc_attr( $post_id ); ?>"
                size="20"
                placeholder="1234"
            />
            <p class="description">
                WP post-ID til artikkel som skal vises som hovedkortet i
                mega-menyen. Tittel og excerpt fra posten brukes automatisk.
            </p>
        </td>
    </tr>

    <tr class="form-field term-skn-mega-button-1-wrap">
        <th scope="row">
            <label for="skn_mega_button_1_label">Knapp 1</label>
        </th>
        <td>
            <input
                type="text"
                name="skn_mega_button_1_label"
                id="skn_mega_button_1_label"
                value="<?php echo esc_attr( $btn1_label ); ?>"
                size="40"
                placeholder="Knivsliping i Oslo"
                style="margin-bottom: 4px;"
            />
            <br />
            <input
                type="text"
                name="skn_mega_button_1_url"
                id="skn_mega_button_1_url"
                value="<?php echo esc_attr( $btn1_url ); ?>"
                size="40"
                placeholder="/knivsliping/oslo"
            />
            <p class="description">
                Label (øverst) og URL (under). Begge må være satt for at
                knappen vises. Relative URLer (start med /) anbefales.
            </p>
        </td>
    </tr>

    <tr class="form-field term-skn-mega-button-2-wrap">
        <th scope="row">
            <label for="skn_mega_button_2_label">Knapp 2</label>
        </th>
        <td>
            <input
                type="text"
                name="skn_mega_button_2_label"
                id="skn_mega_button_2_label"
                value="<?php echo esc_attr( $btn2_label ); ?>"
                size="40"
                placeholder="Slipekurs"
                style="margin-bottom: 4px;"
            />
            <br />
            <input
                type="text"
                name="skn_mega_button_2_url"
                id="skn_mega_button_2_url"
                value="<?php echo esc_attr( $btn2_url ); ?>"
                size="40"
                placeholder="/slipekurs"
            />
        </td>
    </tr>
    <?php
}, 10, 1 );

/**
 * 4) Lagre verdiene ved create/update.
 */
function skn_save_category_mega_editorial( $term_id ) {
    // Post-ID — kun siffer.
    if ( isset( $_POST['skn_mega_post_id'] ) ) {
        $raw   = wp_unslash( $_POST['skn_mega_post_id'] );
        $clean = preg_replace( '/[^0-9]/', '', (string) $raw );
        if ( $clean === '' ) {
            delete_term_meta( $term_id, 'skn_mega_post_id' );
        } else {
            update_term_meta( $term_id, 'skn_mega_post_id', $clean );
        }
    }

    // Knapp-felter — fri tekst, sanitiseres med wp_kses for label,
    // esc_url_raw for url. Tom verdi → slett meta.
    $string_keys = [
        'skn_mega_button_1_label',
        'skn_mega_button_1_url',
        'skn_mega_button_2_label',
        'skn_mega_button_2_url',
    ]; 
    foreach ( $string_keys as $key ) {
        if ( ! isset( $_POST[ $key ] ) ) continue;
        $raw = trim( wp_unslash( $_POST[ $key ] ) );
        if ( $raw === '' ) {
            delete_term_meta( $term_id, $key );
            continue;
        }
        // URL-felter sanitiseres som URL; label-felter strippes for HTML.
        $clean = ( substr( $key, -4 ) === '_url' )
            ? esc_url_raw( $raw )
            : sanitize_text_field( $raw );
        update_term_meta( $term_id, $key, $clean );
    }
}
add_action( 'created_product_cat', 'skn_save_category_mega_editorial' );
add_action( 'edited_product_cat', 'skn_save_category_mega_editorial' );
